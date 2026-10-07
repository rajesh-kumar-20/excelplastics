frappe.ui.form.on("Job Card", {
    before_submit: async function(frm) {
        const { total_completed, total_rejection } = compute_totals(frm);
        // ERPNext STYLE OVERPRODUCTION VALIDATION
            // Get Work Order quantity
            const wo_res = await frappe.db.get_value("Work Order",frm.doc.work_order,"qty");
            const wo_qty = flt(wo_res.message?.qty || 0);
            
            // Get allowed overproduction percentage
            const settings_res = await frappe.db.get_single_value("Additional Manufacturing Settings", "overproduction_percentage_for_job_card");
            const overproduction_percentage = flt(settings_res || 0);
            
            // Calculate maximum allowed quantity
            const allowed_qty = Math.round(wo_qty + (wo_qty * overproduction_percentage / 100));
            
            // Get previous Job Cards for this Work Order + Operation
            const job_cards = await frappe.db.get_list(
                "Job Card",
                {
                    filters: {
                        work_order: frm.doc.work_order,
                        operation_id: frm.doc.operation_id,
                        docstatus: ["!=", 2],
                        name: ["!=", frm.doc.name]
                    },
                    fields: [
                        "name",
                        "total_completed_qty"
                    ],
                    limit_page_length: 0
                }
            );
    
            // Previous Job Cards completed quantity
            const previous_completed_qty = (job_cards || []).reduce((sum, row) => sum + flt(row.total_completed_qty || 0), 0);
    
            // Current Job Card completed quantity
            const current_completed_qty = flt(frm.doc.total_completed_qty || 0);
    
            // Total actual completed quantity
            const total_completed_qty = previous_completed_qty + current_completed_qty;
    
            // Block overproduction
            if (total_completed_qty > allowed_qty) {
                const pending_approval = await frappe.db.get_list(
                "Overproduction Approval",
                {
                    filters: {
                        job_card: frm.doc.name,
                        docstatus: ["!=", 2]
                    },
                    fields: ["name"],
                    limit_page_length: 1
                }
            );
        
            if (pending_approval && pending_approval.length) {

                frappe.validated = false;
        
                frappe.msgprint({
                    title: __("Overproduction Approval Pending"),
                    indicator: "orange",
                    message: __(
                        `Overproduction Approval <b>${pending_approval[0].name}</b> ` +
                        `is pending`
                    )
                });
        
                return;
            }

            // Stop normal Job Card submission
            frappe.validated = false;
        
            const overproduction_qty = total_completed_qty - wo_qty;
            const approval_overproduction_qty = total_completed_qty - allowed_qty;
        
            // =========================================================
            // DIALOG 1 - OVERPRODUCTION DETAILS
            // =========================================================
        
            const overproduction_dialog = new frappe.ui.Dialog({
                title: __("Overproduction Detected"),
        
                fields: [
                    {
                        fieldname: "html",
                        fieldtype: "HTML"
                    }
                ],
        
                primary_action_label: __("Send for Approval"),
        
                primary_action() {
                    overproduction_dialog.hide();
        
                    // =================================================
                    // DIALOG 2 - APPROVAL DETAILS
                    // =================================================
        
                    const approval_dialog = new frappe.ui.Dialog({
                        title: __("Send Overproduction For Approval"),
        
                        fields: [
                            {
                                fieldname: "operator",
                                fieldtype: "Link",
                                options: "Employee",
                                label: __("Operator"),
                                reqd: 1
                            },
                            {
                                fieldname: "reason_for_overproduction",
                                fieldtype: "Small Text",
                                label: __("Reason For Overproduction"),
                                reqd: 1
                            }
                        ],
        
                        primary_action_label: __("Submit"),
        
                        primary_action(values) {
        
                            frappe.call({
                                method: "frappe.client.insert",
                                args: {
                                    doc: {
                                        doctype: "Overproduction Approval",
        
                                        // Automatically from Job Card
                                        job_card: frm.doc.name,
                                        production_item: frm.doc.production_item,
                                        item_name: frm.doc.item_name,
        
                                        // User enters these
                                        operator: values.operator,
                                        reason_for_overproduction: values.reason_for_overproduction,
                                        // Automatically calculated
                                        overproduction_qty: approval_overproduction_qty
                                    }
                                },
        
                                callback(r) {
                                    if (!r.message) {
                                        return;
                                    }
                                    // Mark Job Card as overproduced
                                    frappe.db.set_value("Job Card", frm.doc.name, "custom_is_over_produced", 1)
                                    .then(() => {
                                    
                                        frm.doc.custom_is_over_produced = 1;
                                        frm.refresh_field("custom_is_over_produced");
                                    
                                        approval_dialog.hide();
                                    
                                        frappe.msgprint({
                                            title: __("Approval Sent"),
                                            indicator: "orange",
                                            message: __(
                                                `Overproduction Approval <b>${r.message.name}</b> has been created ` +
                                                `for Job Card <b>${frm.doc.name}</b>.`
                                            )
                                        });
                                    });
                                }
                            });
                        }
                    });
        
                    approval_dialog.show();
                }
            });
        
            // =========================================================
            // DIALOG 1 CONTENT
            // =========================================================
        
            overproduction_dialog.fields_dict.html.$wrapper.html(`
                <div style="font-size: 14px; line-height: 1.8;">
                    <div>
                        Work Order Quantity: <b>${wo_qty}</b>
                    </div>
                    <div>
                        Allowed Overproduction: <b>${overproduction_percentage}%</b>
                    </div>
                    <div>
                        Allowed Quantity: <b>${allowed_qty - wo_qty}</b>
                    </div>
                    <div>
                        Overproduced Quantity: <b>${overproduction_qty}</b>
                    </div>
                    <div>
                        Quantity requiring approval: <b style="color: red;">${approval_overproduction_qty}</b>
                    </div>
                </div>
            `);        
            overproduction_dialog.show();
        }
        // =========================================================
        // EXISTING REMAINING QUANTITY LOGIC — UNCHANGED
        // =========================================================
        const original_qty = frm.doc.for_quantity || 0;
        const produced = total_completed; // ignore rejection
        const remaining = original_qty - produced;
    
        if (remaining <= 0) return;
        frappe.validated = false;
        let d = new frappe.ui.Dialog({
            title: __("Remaining Quantity Detected"),
            fields: [
                {
                    fieldname: "employee",
                    fieldtype: "Link",
                    options: "Employee",
                    label: __("Next Shift Operator"),
                    reqd: 1
                }
            ],
            primary_action_label: __("Continue & Create New Job Card"),
            primary_action(values) {
                d.hide();
                // CRITICAL: Update old Job Card quantity
                frm.set_value("for_quantity", produced);
                frm.save().then(() => {
                    // Submit current Job Card
                    frm.save("Submit").then(() => {
                        // Create new Job Card
                        frappe.confirm(
                            __("Start the new Job Card?"),
    
                            () => {
                                create_and_start_new_job_card(frm, remaining, values.employee, true);
                            },
    
                            () => {
                                create_and_start_new_job_card(frm, remaining, values.employee, false);
                            }
                        );
                    });
                });
            }
        });
    
        d.show();
    },

    refresh(frm) {
        
        if (!frm.is_new()) {
            frm.page.add_action_icon('file', () => {
                const url =
                    `/printview?doctype=${encodeURIComponent(frm.doctype)}` +
                    `&name=${encodeURIComponent(frm.doc.name)}` +
                    `&format=${encodeURIComponent('Job Card Template')}` +
                    `&no_letterhead=0`;
                window.open(url, '_blank');
            });
        }
        
        frm.add_custom_button("QC Report", () => {
            let url = `/printview?doctype=Job Card&name=${frm.doc.name}&format=QC Summary&no_letterhead=0`;
            window.open(url);
        });
        // HIDE STANDARD COMPLETE JOB BUTTON
        $('button[data-label="Complete%20Job"]').hide();
        // SAFE AUTO START AFTER NEW JOB CARD CREATION
        if (
            window._new_jobcard_to_start &&
            window._new_jobcard_to_start === frm.doc.name &&
            frm.doc.status === "Open"
        ) {
            window._new_jobcard_to_start = null;
            const btn = frm.page.wrapper.find(
                'button[data-label="Start Job"], button[data-label="Start%20Job"]'
            );
            if (btn.length) {
                validate_and_start(frm, btn[0]);
            }
        }
        // POST-START MCO HOOK
        if (
            window._pending_mco &&
            window._pending_mco_jobcard === frm.doc.name &&
            frm.doc.status === "Work In Progress"
        ) {
            create_mco_after_start(frm);
        }
        // INSTALL START JOB GUARD (ONCE)
        if (!window._start_job_guard_installed) {
            window._start_job_guard_installed = true;
            window._allow_start_job = false;
            document.addEventListener(
                "click",
                function (e) {
                    const btn = e.target.closest(
                        'button[data-label="Start Job"], button[data-label="Start%20Job"]'
                    );
                    if (!btn) return;
                    if (!cur_frm || cur_frm.doctype !== "Job Card") return;
                    if (window._allow_start_job) {
                        window._allow_start_job = false;
                        return;
                    }
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    validate_and_start(cur_frm, btn);
                },
                true
            );
        }
        // PAUSE JOB INTERCEPTOR (ONCE)
        if (!window._pause_job_guard_installed) {
            window._pause_job_guard_installed = true;
            document.addEventListener(
                "click",
                function (e) {
                    const btn = e.target.closest(
                        'button[data-label="Pause Job"], button[data-label="Pause%20Job"]'
                    );
                    if (!btn) return;
                    if (!cur_frm || cur_frm.doctype !== "Job Card") return;
                    if (cur_frm.__allow_pause) {
                        cur_frm.__allow_pause = false;
                        return;
                    }
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    let active_row =
                        (cur_frm.doc.time_logs || []).find(r => !r.to_time);
                    if (!active_row) {
                        frappe.msgprint(__('No running time log found.'));
                        return;
                    }
                    frappe.prompt(
                        [{
                            fieldname: 'pause_reason',
                            fieldtype: 'Data',
                            label: __('Pause Reason'),
                            reqd: 1
                        }],
                        (values) => {
        
                            frappe.db.set_value(
                                active_row.doctype,
                                active_row.name,
                                "custom_pause_reason",
                                values.pause_reason
                            ).then(() => {
                            
                                cur_frm.__allow_pause = true;
                            
                                btn.dispatchEvent(
                                    new MouseEvent("click", {
                                        bubbles: true,
                                        cancelable: true,
                                        view: window
                                    })
                                );
                            });
                        },
                        __('Pause Job'),
                        __('Pause')
                    );
        
                },
                true
            );
        }  
        // PREVENT CHANGES ON SUBMITTED DOC
        if (frm.doc.docstatus === 1) return;
        // COMPUTE TOTALS
        const { total_completed, total_rejection } = compute_totals(frm);
        const qty = frm.doc.for_quantity || 0;
        // HIDE START / STOPWATCH WHEN DONE
        setTimeout(() => {
            if (total_completed  >= qty) {
                $(".stopwatch").hide();
                $('button[data-label="Start%20Job"]').hide();
            }
        }, 300);
        // CUSTOM COMPLETE BUTTON
        if (
            frm.doc.status === "Work In Progress" &&
            !frm.doc.is_paused &&
            total_completed + total_rejection < qty
        ) {
            let btn = frm.add_custom_button(__("Complete"), () => {
                open_completion_dialog(frm, total_completed, total_rejection);
            });
            // 🔥 Make it black
            $(btn)
                .removeClass("btn-default")
                .addClass("btn-dark")
                .css({
                    "background-color": "#000",
                    "color": "#fff",
                    "border-color": "#000"
                });
        }
        // QC REPORT BUTTON
    },
    validate(frm) {
        if (frm.doc.docstatus === 1) return;
        const { total_completed, total_rejection } = compute_totals(frm);
        // if (total_completed + total_rejection > (frm.doc.for_quantity || 0)) {
        // if (total_completed > (frm.doc.for_quantity || 0)) {
        //     frappe.throw(
        //         __("Completed quantity cannot exceed Qty to Manufacture")
        //     );
        // }
    }
});
// TOTALS
function compute_totals(frm) {
    const total_completed = (frm.doc.time_logs || []).reduce(
        (sum, row) => sum + (row.completed_qty || 0),
        0
    );
    const total_rejection = (frm.doc.time_logs || []).reduce(
        (sum, row) => sum + (row.custom_rejection_qty || 0),
        0
    );
    if (frm.doc.docstatus === 0) {
        frm.set_value("custom_rejection", total_rejection);
    }
    return { total_completed, total_rejection };
}
// COMPLETE JOB FLOW
function open_completion_dialog(frm, total_completed, total_rejection) {
    const remaining_qty = frm.doc.for_quantity - total_completed;
    const dialog = new frappe.ui.Dialog({
        title: __("Complete Job"),
        fields: [
            {
                fieldname: "partial_qty",
                fieldtype: "Float",
                label: __("Completed Quantity"),
                default: remaining_qty,
                reqd: 1,
                onchange: toggle_employee
            },
            {
                fieldname: "custom_rejection_qty",
                fieldtype: "Float",
                label: __("Rejected Quantity"),
                default: 0,
                onchange: toggle_employee
            },
            {
                fieldname: "employee",
                fieldtype: "Link",
                options: "Employee",
                label: __("Next Shift Operator"),
                hidden: 1
            }
        ],
        //  PRIMARY ACTION
        primary_action_label: __("Continue New Job Card"),
        primary_action(values) {
            const completed = values.partial_qty || 0;
            const rejected = values.custom_rejection_qty || 0;
            // ✅ FULL COMPLETION → no confirmation
            if (completed >= remaining_qty) {
                handle_completion(frm, values, remaining_qty, false);
                dialog.hide();
                return;
            }
            //  PARTIAL → ask confirmation
            frappe.confirm(
                __("Start the new Job Card?"),
                // YES → Create + Start
                () => {
                    handle_completion(frm, values, remaining_qty, true);
                    dialog.hide();
                },
                // NO → Only Create
                () => {
                    handle_completion(frm, values, remaining_qty, false);
                    dialog.hide();
                }
            );
        }
    });
    // 🔄 Toggle Employee Field
    function toggle_employee() {
        const c = dialog.get_value("partial_qty") || 0;
        const r = dialog.get_value("custom_rejection_qty") || 0;
        if (c < remaining_qty) {
            // 🔹 PARTIAL COMPLETION
            dialog.set_df_property("employee", "hidden", 0);
            dialog.set_df_property("employee", "reqd", 1);
            dialog.get_primary_btn().text(__("Continue New Job Card"));
        } else {
            // 🔹 FULL COMPLETION
            dialog.set_df_property("employee", "hidden", 1);
            dialog.set_df_property("employee", "reqd", 0);
            dialog.set_value("employee", null);
            dialog.get_primary_btn().text(__("Complete Job"));
        }
    }
    dialog.show();
    toggle_employee();
}
// 🔧 HANDLE COMPLETION LOGIC
function handle_completion(frm, values, remaining_qty, auto_start) {
    const completed = values.partial_qty || 0;
    const rejected = values.custom_rejection_qty || 0;
    const employee = values.employee || null;
    if (completed <= 0) {
        frappe.msgprint("❌ Completed quantity must be greater than zero");
        return;
    }
    if (completed > remaining_qty) {
        frappe.msgprint("❌ Entered quantity exceeds remaining quantity");
        return;
    }
    if (completed < remaining_qty && !employee) {
        frappe.msgprint("❌ Employee is mandatory for partial completion");
        return;
    }
    // 🔥 MARK DOCUMENT DIRTY (CRITICAL)
    const logs = frm.doc.time_logs || [];
    const active_log = logs.find(r => !r.to_time);

    if (!active_log) {
        frappe.msgprint("❌ No active time log found");
        return;
    }
    frappe.model.set_value(
        active_log.doctype,
        active_log.name,
        "to_time",
        frappe.datetime.now_datetime()
    );
    frappe.model.set_value(
        active_log.doctype,
        active_log.name,
        "completed_qty",
        completed
    );
    frappe.model.set_value(
        active_log.doctype,
        active_log.name,
        "custom_rejection_qty",
        rejected
    );
    const produced = completed; // ✅ ignore rejection
    const balance = remaining_qty - completed;
    const { total_completed, total_rejection } = compute_totals(frm);
    // 🔥 REQUIRED FOR FG STOCK ENTRY
    frm.set_value("for_quantity", total_completed);
    frm.save().then(() => {
        frappe.call({
            method: "frappe.client.submit",
            args: {
                doc: frm.doc
            },
            callback() {
                frm.disable_form();
                if (balance > 0) {
                    create_and_start_new_job_card(
                        frm,
                        balance,
                        employee,
                        auto_start
                    );
                }
            }
        });
    });
}
function create_and_start_new_job_card(frm, qty, employee, auto_start = true) {
    let new_doc = {
        doctype: "Job Card",
        work_order: frm.doc.work_order,
        production_item: frm.doc.production_item,
        operation: frm.doc.operation,
        operation_id: frm.doc.operation_id,
        workstation_type: frm.doc.workstation_type,
        remarks: "Auto created for remaining qty from "+frm.doc.name,
        for_quantity: qty,
        company: frm.doc.company,
        status: "Open"
    };
    // Only copy workstation + employee for auto-start flows
    if (auto_start) {
        new_doc.workstation = frm.doc.workstation;
        if (employee) {
            new_doc.employee = [{ employee }];
        }
    }
    frappe.call({
    method: "frappe.client.insert",
    args: { doc: new_doc },
    callback(res) {
        if (!res.message) {
            return;
        }
        const new_name = res.message.name;
        // Save for later validation
        window._new_jobcard_to_start = auto_start ? new_name : null;
        frappe.set_route("Form", "Job Card", new_name);
    },
        error(err) {
            frappe.call({
                method: "excelplastic_app.api.log_jobcard_debug",
                args: {
                    title: `JC INSERT ERROR - ${frm.doc.name}`,
                    message: JSON.stringify({
                        error: err,
                        new_doc
                    }, null, 2),
                    reference_doctype: frm.doctype,
                    reference_name: frm.doc.name
                }
            });
        }
    });
}
async function validate_and_start(frm, btn) {
    //  WORKSTATION MANDATORY CHECK
    if (!frm.doc.workstation) {
        frappe.msgprint({
            title: __("Missing Workstation"),
            indicator: "red",
            message: __("Please select a <b>Workstation</b> before starting the Job.")
        });
        return; // ⛔ BLOCK START JOB
    }
    //  MOLD AVAILABILITY VALIDATION
    if (frm.doc.custom_mold) {
        const res = await frappe.db.get_value(
            "Mold Master",
            frm.doc.custom_mold,
            "status"
        );
        const status = res?.message?.status;
        if (status == "Maintenance") {
            frappe.msgprint({
                title: __("Mold Not Available"),
                indicator: "red",
                message: __(
                    `Mold <b>${frm.doc.custom_mold}</b> is under <b>${status || "Unknown"}</b>.`
                )
            });
            return; // ⛔ BLOCK START JOB
        }
    }
    //  WORKSTATION BUSY VALIDATION (START JOB ONLY)
    let running = await frappe.db.get_list("Job Card", {
        filters: {
            workstation: frm.doc.workstation,
            status: "Work In Progress",
            custom_is_over_produced: 0,
            name: ["!=", frm.doc.name]
        },
        limit: 1
    });
    if (running && running.length) {
        frappe.msgprint({
            title: "Workstation Busy",
            indicator: "red",
            message: __(
                `Workstation <b>${frm.doc.workstation}</b> is already running Job Card <b>${running[0].name}</b>.<br><br>
                 Please complete it before starting a new Job Card.`
            )
        });
        return; // ⛔ BLOCK START JOB
    }
    let prev = frm.doc.custom_previous_mold;
    let curr = frm.doc.custom_mold;
    let item = frm.doc.item_name;
    let prev_item = null;
    if (prev) {
        const r = await frappe.db.get_value("Mold Master", prev, "description");
        prev_item = r?.message?.description || "";
    }
    if (prev && curr && prev !== curr) {
        let d = new frappe.ui.Dialog({
            title: "Mold Change Over Initiated",
            primary_action_label: "OK",
            primary_action: () => {
                d.hide();
            
                window._pending_mco = true;
                window._pending_mco_jobcard = frm.doc.name;
            
                trigger_native_start(btn);
            },
            secondary_action_label: "Cancel",
            secondary_action: () => {
                // Cancel all pending auto-start actions
                window._pending_mco = false;
                window._pending_mco_jobcard = null;
                window._allow_start_job = false;
            
                d.hide();
            
                frappe.msgprint({
                    title: __("Cancelled"),
                    indicator: "orange",
                    message: __("Start Job cancelled.")
                });
            }
        });
        d.$body.html(`
            Previous Mold: <b>${prev}-${prev_item}</b><br>
            Required Mold: <b>${curr}-${item}</b><br><br>
        `);
        d.show();
        return;
    }
    trigger_native_start(btn);
}
function trigger_native_start(btn) {
    window._allow_start_job = true;
    setTimeout(() => {
        btn.dispatchEvent(
            new MouseEvent("click", { bubbles: true, cancelable: true, view: window })
        );
        window._allow_start_job = false;
    }, 30);
}

// CREATE MCO AFTER START
async function create_mco_after_start(frm) {
    let logs = frm.doc.time_logs || [];
    let active_log = logs.filter(l => !l.to_time)
        .sort((a, b) => new Date(b.from_time) - new Date(a.from_time))[0];
    if (!active_log || !active_log.employee) return;
    window._pending_mco = false;
    window._pending_mco_jobcard = null;
    await create_mco(frm, active_log.employee);
}

// CREATE MOLD CHANGE OVER (FULL LOGIC)
async function create_mco(frm, operator = "") {

    // 🔹 Fetch BOM
    let bom = await frappe.xcall("frappe.client.get", {
        doctype: "BOM",
        name: frm.doc.bom_no
    });

    // 🔹 Get Standard Cycle Time
    let std_cycle_time = 0;
    if (bom.operations && frm.doc.operation) {
        let op = bom.operations.find(o => o.operation === frm.doc.operation);
        if (op && op.operation_time_sec) {
            std_cycle_time = op.operation_time_sec;
        }
    }

    // 🔹 Get Material & Masterbatch from BOM using Item flags
    let material_grade = "";
    let master_batch = "";
    let color_percentage = 0;

    for (let rm of (bom.items || [])) {

        let res = await frappe.db.get_value("Item", rm.item_code, [
            "custom_is_material_grade",
            "custom_is_color_grade"
        ]);

        let item = res.message;
        // ✅ Material Grade
        if (item.custom_is_material_grade && !material_grade) {
            material_grade = rm.item_code;
        }

        // 🎨 Masterbatch
        if (item.custom_is_color_grade && !master_batch) {
            master_batch = rm.item_code;
            color_percentage = rm.loading_value || 0;
        }
    }

    // 🔹 Get Weight per Unit from Production Item
    let weight = 0;
    if (frm.doc.production_item) {
        let res = await frappe.db.get_value("Item", frm.doc.production_item, "weight_per_unit");
        weight = Number(res.message.weight_per_unit || 0);
    }

    // 🔹 Get Customer & Sales Order
    let customer_code = "";
    let sales_order = "";

    if (frm.doc.work_order) {
        let wo = await frappe.db.get_doc("Work Order", frm.doc.work_order);
        sales_order = wo.sales_order;

        if (sales_order) {
            let so = await frappe.db.get_doc("Sales Order", sales_order);
            customer_code = so.customer;
        }
    }

    // 🔹 Create MCO
    let mco = await frappe.xcall("frappe.client.insert", {
        doc: {
            doctype: "Mold Change Over",
            job_card: frm.doc.name,
            work_order: frm.doc.work_order,
            workflow_state: "GM Approval Pending",
            operation: frm.doc.operation,
            std_cycle_time,
            date: frm.doc.posting_date,
            change_date: frm.doc.posting_date,
            item_code: frm.doc.production_item,
            unloading_mold_name: frm.doc.custom_previous_mold,
            mold_no: frm.doc.custom_mold,
            cavity_nos: frm.doc.custom_cavity,
            total_cavity: frm.doc.custom_cavity,
            mold_unload_start_time: frappe.datetime.now_datetime(),
            machine_name: frm.doc.workstation,
            machine_running_status: "Ok",
            // ✅ Clean Fields
            material_grade,
            master_batch,
            color: color_percentage,
            weight,
            total_quantity: frm.doc.for_quantity,
            customer_code,
            sales_order,
            operator,
            quality_approved: "Accepted",
            line_clearance: 1,
            first_piece_approval: 1
        }
    });

    // 🔹 Success Message
    if (mco && mco.name) {
        frappe.msgprint({
            title: __("Success"),
            indicator: "green",
            message: __(`Mold Change Over created <b>${mco.name}</b>`)
        });
    }
    // 🔹 Update Workstation Mold
    try {
        await frappe.xcall("frappe.client.set_value", {
            doctype: "Workstation",
            name: frm.doc.workstation,
            fieldname: "custom_mold_id",
            value: frm.doc.custom_mold
        });
    } catch {
        frappe.msgprint("⚠ Failed to update Workstation mold.");
    }
}

// frappe.ui.form.on('Job Card Time Log', {
//     from_time(frm, cdt, cdn) {
//         detect_shift_after_both_times(frm, cdt, cdn);
//     },
//     to_time(frm, cdt, cdn) {
//         detect_shift_after_both_times(frm, cdt, cdn);
//     },
//     custom_shift_type(frm, cdt, cdn) {
//         // from detect_shift_after_both_times()
//         if (frm._setting_shift_from_time) {
//             return;
//         }
//         // User manually selected shift
//         set_time_from_shift_type(frm, cdt, cdn);
//     }
// });

// function detect_shift_after_both_times(frm, cdt, cdn) {
//     let row = locals[cdt][cdn];
//     // Detect shift only after both times are entered
//     if (!row.from_time || !row.to_time) {
//         return;
//     }
//     let from = moment(row.from_time);
//     let minutes = from.hour() * 60 + from.minute();
//     let shift =
//         (minutes >= 420 && minutes < 1140)
//             ? "Day"
//             : "Night";
//     // Prevent custom_shift_type event
//     frm._setting_shift_from_time = true;
//     frappe.model.set_value(
//         cdt,
//         cdn,
//         "custom_shift_type",
//         shift
//     ).then(() => {
//         frm._setting_shift_from_time = false;
//     });
// }

// function set_time_from_shift_type(frm, cdt, cdn) {

//     let row = locals[cdt][cdn];
//     if (!row.custom_shift_type) {
//         return;
//     }
//     frappe.db.get_value(
//         "Shift Type",
//         row.custom_shift_type,
//         ["start_time", "end_time"]
//     ).then(r => {
//         if (!r.message) {
//             return;
//         }
//         let base_date;
//         // Preserve existing date if available
//         if (row.from_time) {
//             base_date = moment(row.from_time).format("YYYY-MM-DD");
//         } else {
//             base_date = frappe.datetime.get_today();
//         }
//         let from_time = moment(
//             `${base_date} ${r.message.start_time}`
//         );
//         let to_time = moment(
//             `${base_date} ${r.message.end_time}`
//         );
//         // Handle overnight shifts
//         if (to_time.isBefore(from_time)) {
//             to_time.add(1, "day");
//         }
//         frappe.model.set_value(
//             cdt,
//             cdn,
//             "from_time",
//             from_time.format("YYYY-MM-DD HH:mm:ss")
//         );
//         frappe.model.set_value(
//             cdt,
//             cdn,
//             "to_time",
//             to_time.format("YYYY-MM-DD HH:mm:ss")
//         );
//     });
// }


s
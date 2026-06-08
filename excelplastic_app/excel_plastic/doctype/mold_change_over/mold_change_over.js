// Copyright (c) 2026, Rajesh Kumar and contributors
// For license information, please see license.txt

frappe.ui.form.on("Mold Change Over", {
    refresh(frm) {

        // -------------------------------
        // ⭐ SECTION 1: UNLOAD / LOAD BUTTONS (docstatus = 0)
        // -------------------------------

        if (frm.doc.docstatus === 0) {

            // Start Unload
            if (!frm.doc.mold_unload_start_time) {
                let btn = frm.add_custom_button("Start Unload", async () => {
                    frm.set_value("mold_unload_start_time", frappe.datetime.now_datetime());
                    await frm.save();
                    frappe.msgprint("✔ Mold unload STARTED.");
                    frm.reload_doc();
                });
                btn.removeClass("btn-default").addClass("btn-dark");
            }

            // Complete Unload
            // if (frm.doc.mold_unload_start_time && !frm.doc.mold_unload_complete_time) {
            //     let btn = frm.add_custom_button("Complete Unload", async () => {
            //         frm.set_value("mold_unload_complete_time", frappe.datetime.now_datetime());
            //         await frm.save();
            //         frappe.msgprint("✔ Mold unload COMPLETED.");
            //         frm.reload_doc();
            //     });
            //     btn.removeClass("btn-default").addClass("btn-dark");
            // }

            // Start Load
            // if (frm.doc.mold_unload_complete_time && !frm.doc.mold_load_start_time) {
            //     let btn = frm.add_custom_button("Start Load", async () => {
            //         frm.set_value("mold_load_start_time", frappe.datetime.now_datetime());
            //         await frm.save();
            //         frappe.msgprint("✔ Mold load STARTED.");
            //         frm.reload_doc();
            //     });
            //     btn.removeClass("btn-default").addClass("btn-dark");
            // }

            // Complete Load
            if (frm.doc.mold_unload_start_time && !frm.doc.mold_load_complete_time) {
                let btn = frm.add_custom_button("Complete Load", async () => {
                    frm.set_value("mold_load_complete_time", frappe.datetime.now_datetime());
                    await frm.save();
                    frappe.msgprint("✔ Mold load COMPLETED.");
                    frm.reload_doc();
                });
                btn.removeClass("btn-default").addClass("btn-dark");
            }
        }


// -------------------------------
// ⭐ SECTION 2: CLEARANCE CHECK BUTTON (docstatus = 1)
// -------------------------------

if (frm.doc.docstatus === 1) {

    frappe.db.get_value(
        "Line Clearance",
        { mold_change_over: frm.doc.name },
        "name"
    ).then(res => {

        if (!res.message || !res.message.name) {

            frm.add_custom_button("Line Clearance", () => {

                frappe.call({
                    method: "frappe.client.insert",
                    args: {
                        doc: {
                            doctype: "Line Clearance",
                            date: frappe.datetime.now_date(),

                            offloading_start_time: frm.doc.mold_unload_start_time,
                            offloading_complete_time: frm.doc.mold_unload_complete_time,
                            mold_load_start_time: frm.doc.mold_load_start_time,
                            mold_load_complete_time: frm.doc.mold_load_complete_time,

                            mold_change_over: frm.doc.name,
                            machine: frm.doc.machine_name,
                            loading_mold_name: frm.doc.new_mold,
                            previous_mold: frm.doc.unloading_mold_name,
                            new_mold: frm.doc.loading_mold_name,
                            prepared_by: frm.doc.prepared_by,
                            checked_by: frm.doc.checked_by,
                            approved_by: frm.doc.approved_by,

                            loose_parts_check: 1,
                            fit_check: 1,
                            loose_parts: 1,
                            cooling_airline_check: 1,
                            dry_resin: 1,
                            color_mixing: 1,
                            packing_table: 1,
                            packing_place: 1,
                            previous_product: 1,
                            next_product: 1,

                            line_clearance: frm.doc.line_clearance, // 🔴 IMPORTANT
                            any_defect: 1,
                            customer_complaint: 1,
                            as_per_specification: 1,
                            precaution: 1,
                            packing_as_per_specification: 1,
                            trained_workers: 1
                        }
                    },
                    callback: function(r) {

                        if (!r.message) return;

                        let lc_name = r.message.name;

                        // ✅ Submit ONLY if checkbox is checked
                        if (frm.doc.line_clearance) {

                            frappe.call({
                                method: "frappe.client.submit",
                                args: {
                                    doc: {
                                        doctype: "Line Clearance",
                                        name: lc_name
                                    }
                                },
                                callback: function() {
                                    frappe.msgprint({
                                        message: `Line Clearance <b>${lc_name}</b> Submitted`,
                                        indicator: "green"
                                    });
                                    frm.reload_doc();
                                }
                            });

                        } else {
                            frappe.msgprint({
                                message: `Line Clearance <b>${lc_name}</b> Saved`,
                                indicator: "blue"
                            });
                            frm.reload_doc();
                        }
                    }
                });

            }, __("Create"));
        }
    });
}


    }
});




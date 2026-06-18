//auto populate mold details
frappe.ui.form.on('BOM', {
    item: function(frm) {
        if (!frm.doc.item) return;

        frappe.db.get_doc('Item', frm.doc.item).then(item_doc => {
            const molds = item_doc.custom_mold_id || [];

            if (molds.length === 1) {
                const mold_name = molds[0].mold_id;  //  real fieldname confirmed
                frm.set_value('custom_mold', mold_name);
            } else if (molds.length > 1) {
                const valid_molds = molds.map(m => m.mold_id).filter(Boolean); 
                frm.mold_options = valid_molds;

                frm.set_query('custom_mold', () => {
                    return {
                        filters: [['name', 'in', valid_molds]]
                    };
                });

                frappe.msgprint({
                    title: 'Multiple Molds Found',
                    message: 'Multiple molds found. Please select one.',
                    indicator: 'orange',
                    alert: true,
                    primary_action: undefined,
                    clear: true // clears previous identical messages
                });
                frm.set_value('custom_mold', '');
                frm.refresh_field('custom_mold');
            } else {
                frm.set_value('custom_mold', '');
            }
        });
    },
    loading_value: function (frm, cdt, cdn) {
        let row = locals[cdt][cdn];

        frappe.db.get_value("Item", row.item_code, ["allow_loading_calculation"]).then(item_res => {
            const item_data = item_res.message;
            if (!item_data.allow_loading_calculation) return;

            // Get Finished Item
            frappe.call({
                method: "frappe.client.get",
                args: {
                    doctype: "Item",
                    name: frm.doc.item
                },
                callback: function (r) {
                    const item_doc = r.message;

                    const weight = parseFloat(item_doc.weight_per_unit);
                    const uom = item_doc.weight_uom || "Kg";

                    // Validate weight
                    if (isNaN(weight) || weight <= 0) {
                        frappe.msgprint({
                            title: "Missing Weight",
                            message: `Finished Item '${frm.doc.item}' has no valid Weight Per Unit.`,
                            indicator: 'red'
                        });
                        return;
                    }

                    const new_qty = Math.round(weight * (row.loading_value / 100) * 1000) / 1000;

                    frappe.model.set_value(cdt, cdn, 'qty', new_qty);
                    frappe.model.set_value(cdt, cdn, 'uom', uom);
                }
            });

            // Total loading check
            const rows = frm.doc.items || [];
            const loading_promises = rows.map(i =>
                frappe.db.get_value("Item", i.item_code, "allow_loading_calculation")
                    .then(res => res.message.allow_loading_calculation ? (i.loading_value || 0) : 0)
            );

            Promise.all(loading_promises).then(values => {
                const total = values.reduce((sum, val) => sum + val, 0);

                frappe.show_alert({
                    message: total > 100
                        ? `Total loading exceeds 100%: ${total.toFixed(2)}%`
                        : `Current total loading: ${total.toFixed(2)}%`,
                    indicator: total > 100 ? 'red' : 'green'
                });
            });
        });
    },

// Block saving the BOM if:
// - Total loading > 100%
// - OR Finished Item lacks valid 'Weight'


    validate: function(frm) {

        return frappe.call({
            method: "frappe.client.get",
            args: {
                doctype: "Item",
                name: frm.doc.item
            }
        }).then(res => {
            const item_doc = res.message;

            const weight = parseFloat(item_doc.weight_per_unit);

            // Validate weight
            if (isNaN(weight) || weight <= 0) {
                frappe.throw(`Finished Item '${frm.doc.item}' does not have valid Weight.`);
            }

            // Validate total loading
            const rows = frm.doc.items || [];
            const loading_promises = rows.map(row =>
                frappe.db.get_value("Item", row.item_code, "allow_loading_calculation")
                    .then(res => res.message.allow_loading_calculation ? (row.loading_value || 0) : 0)
            );

            return Promise.all(loading_promises).then(values => {
                const total = values.reduce((sum, val) => sum + val, 0);

                if (total > 100) {
                    frappe.throw(`RM & MB loading exceeds 100%: ${total.toFixed(2)}%.`);
                }
            });
        });
    },
//auto populate operation details and cavity details from mold master
    custom_mold: function(frm) {
        if (!frm.doc.custom_mold) return;

        frappe.call({
            method: "frappe.client.get",
            args: {
                doctype: "Mold Master",
                name: frm.doc.custom_mold
            },
            callback: function(r) {
                if (!r.exc && r.message) {
                    const mold = r.message;
                    const custom_process = mold.process_name;
                    const cavity_expr = mold.no_of_cavity;

                    if (!custom_process) {
                        frappe.msgprint('No process_name found in selected Mold.');
                        return;
                    }

                    // Update BOM-level field if needed
                    // frm.set_value('custom_process', custom_process);

                    // Clear & create new operation row
                    frm.clear_table("operations");
                    let row = frm.add_child("operations");

                    // Safely evaluate cavity expression from Mold Master
                    let evaluated_batch = null;
                    try {
                        evaluated_batch = cavity_expr ? eval(cavity_expr) : null;
                    } catch (e) {
                        frappe.msgprint(`Invalid expression in Mold's No of Cavity: "${cavity_expr}"`);
                    }

                    // Set both values properly
                    frappe.model.set_value(row.doctype, row.name, 'operation', custom_process);
                    frappe.model.set_value(row.doctype, row.name, 'batch_size', evaluated_batch);

                    frm.refresh_field("operations");
                }
            }
        });
    },
    custom_mold:function(frm) {
      frappe.db.get_value('Mold Master', frm.doc.custom_mold, 'customer_id', (res) => {
      const customer = res.customer_id || null;
      frm.set_value('custom_customer', customer);
    });
  },
  custom_default_source_warehouse: function(frm) {

        if (!frm.doc.custom_default_source_warehouse) return;

        frm.doc.items.forEach(function(row) {
            row.source_warehouse = frm.doc.custom_default_source_warehouse;
        });

        frm.refresh_field('items');
    }
});



frappe.ui.form.on('BOM Operation', {
    operation_time_sec: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        row.time_in_mins = (row.operation_time_sec || 0) / 60;
        frm.refresh_field('operations');
    }
});

// Also apply when adding new row
frappe.ui.form.on('BOM Item', {

    items_add: function(frm, cdt, cdn) {

        let row = locals[cdt][cdn];

        if (frm.doc.custom_default_source_warehouse) {
            row.source_warehouse = frm.doc.custom_default_source_warehouse;
            frm.refresh_field('items');
        }
    }

});



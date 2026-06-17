//Remove option in Order type
frappe.ui.form.on('Sales Order', {
    refresh: function(frm) {
        let fieldname = 'order_type'; 
        
        if (frm.fields_dict[fieldname]) {
            let remove_option = ["","Shopping Cart", "Maintenance"]; 
            frm.fields_dict[fieldname].df.options = frm.fields_dict[fieldname].df.options
                .split("\n") 
                .filter(option => !remove_option.includes(option))
                .join("\n"); 
            frm.refresh_field(fieldname);
        }
    }
    
});


//Auto populate packing Type from Item Master


frappe.ui.form.on('Sales Order Item', {
    item_code: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];

        if (row.item_code) {
            frappe.db.get_value("Item", row.item_code, "custom_packing_type", (r) => {
                if (r && r.custom_packing_type) {
                    frappe.model.set_value(cdt, cdn, "custom_packing_type", r.custom_packing_type);
                }
            });
        }
    }
});

//Adding inner button Proforma invoice in Get Item From

frappe.ui.form.on('Sales Order', {
    refresh(frm) {
        if (frm.doc.docstatus === 0) {
            frm.page.add_inner_button(__('Proforma Invoice'), () => {
                if (!frm.doc.customer) {
                    frappe.msgprint(__('Please select a Customer.'));
                    return;
                }
                new frappe.ui.form.MultiSelectDialog({
                    doctype: "Proforma Invoice",
                    target: frm,
                    setters: {
                        customer: frm.doc.customer
                    },
                    get_query() {
                        return {
                            filters: {
                                docstatus: 1,
                                customer: frm.doc.customer
                            }
                        };
                    },
                    action: async function(selections) {
                        if (!selections.length) {
                            frappe.msgprint(__('No Proforma Invoice selected.'));
                            return;
                        }
                        frm.clear_table('items');
                        for (let name of selections) {
                            let doc = await frappe.db.get_doc('Proforma Invoice', name);
                            doc.items.forEach(item => {
                                let row = frm.add_child('items');
                                row.item_code = item.item_code;
                                row.item_name = item.item_name;
                                row.qty = item.qty;
                                row.rate = item.rate;
                                row.uom = item.uom;
                                row.delivery_date = frm.doc.delivery_date;
                                row.prevdoc_docname = item.prevdoc_docname;
                                row.proforma_invoice = name;
                                // row.warehouse = item.warehouse; // uncomment if warehouse is needed
                            });
                        }
                        frm.refresh_field('items');
                        this.dialog.hide();
                        // frappe.msgprint(__('Items added from selected Proforma Invoices.'));
                    }
                });
            }, __('Get Items From'));
        }
    }
});






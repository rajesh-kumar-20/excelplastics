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


erpnext.selling.SalesOrderController.prototype.make_work_order = function () {
    var me = this;

    me.frm.call({
        method: "erpnext.selling.doctype.sales_order.sales_order.get_work_order_items",
        args: {
            sales_order: this.frm.docname,
        },
        freeze: true,
        callback: function (r) {
            if (!r.message || !r.message.length) {
                frappe.call({
                    method: "excelplastic_app.excel_plastic.utils.work_order_qty.has_existing_work_order_for_sales_order",
                    args: {
                        sales_order: me.frm.docname,
                    },
                    callback: function (result) {
                        if (result.message) {
                            frappe.msgprint({
                                title: __("Work Order Already Created"),
                                message: __(
                                    "Work Order is already created for all Sales Order items."
                                ),
                                indicator: "orange",
                            });
                        } else {
                            frappe.msgprint({
                                title: __("Work Order not created"),
                                message: __(
                                    "No Items with Bill of Materials to Manufacture"
                                ),
                                indicator: "orange",
                            });
                        }
                    },
                });

                return;
            } else {
                const fields = [
                    {
                        label: __("Items"),
                        fieldtype: "Table",
                        fieldname: "items",
                        description: __("Select BOM and Qty for Production"),
                        fields: [
                            {
                                fieldtype: "Link",
                                options: "Item",
                                read_only: 1,
                                fieldname: "item_code",
                                label: __("Item Code"),
                                in_list_view: 1,
                            },
                            {
                                fieldtype: "Link",
                                fieldname: "bom",
                                options: "BOM",
                                reqd: 1,
                                label: __("Select BOM"),
                                in_list_view: 1,
                                get_query: function (doc) {
                                    return {
                                        filters: {
                                            item: doc.item_code,
                                        },
                                    };
                                },
                            },
                            {
                                fieldtype: "Float",
                                fieldname: "pending_qty",
                                reqd: 1,
                                label: __("Qty"),
                                in_list_view: 1,
                            },
                            {
                                fieldtype: "Data",
                                fieldname: "sales_order_item",
                                reqd: 1,
                                label: __("Sales Order Item"),
                                hidden: 1,
                            },
                        ],
                        data: r.message,
                        get_data: () => {
                            return r.message;
                        },
                    },
                ];

                var d = new frappe.ui.Dialog({
                    title: __("Select Items to Manufacture"),
                    fields: fields,
                    primary_action: function () {
                        var data = {
                            items: d.fields_dict.items.grid.get_selected_children(),
                        };

                        if (!data.items.length) {
                            frappe.throw(
                                __("Please select atleast one item to continue")
                            );
                        }

                        me.frm.call({
                            method: "make_work_orders",
                            args: {
                                items: data,
                                company: me.frm.doc.company,
                                sales_order: me.frm.docname,
                                project: me.frm.project,
                            },
                            freeze: true,
                            callback: function (r) {
                                if (r.message) {
                                    frappe.msgprint({
                                        message: __("Work Orders Created: {0}", [
                                            r.message
                                                .map(function (d) {
                                                    return repl(
                                                        '<a href="/app/work-order/%(name)s">%(name)s</a>',
                                                        { name: d }
                                                    );
                                                })
                                                .join(", "),
                                        ]),
                                        indicator: "green",
                                    });
                                }

                                d.hide();
                                me.frm.reload_doc();
                            },
                        });
                    },
                    primary_action_label: __("Create"),
                });

                d.show();
            }
        },
    });
};
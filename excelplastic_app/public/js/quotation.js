frappe.ui.form.on('Quotation', {
    refresh: function(frm) {

        if (frm.doc.docstatus === 1) {

            frm.add_custom_button('Email', function() {
                frm.email_doc();
            });

        }
    }
});

frappe.ui.form.on('Quotation', {
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

frappe.ui.form.on("Quotation", {
    refresh(frm) {
        if (!frm.is_new() && frm.doc.docstatus === 1 && frm.doc.status !== "Ordered") {
            
            frappe.call({
                method: "excelplastic_app.api.has_proforma_invoice",
                args: { quotation_name: frm.doc.name },
                callback(r) {
                    if (!r.message) {
                        // No PI yet → show button
                        frm.add_custom_button("Proforma Invoice", function () {
                            frappe.model.with_doctype("Proforma Invoice", function () {
                                let pi = frappe.model.get_new_doc("Proforma Invoice");
                                // Copy header fields
                                Object.assign(pi, {
                                    customer: frm.doc.party_name,
                                    company: frm.doc.company,
                                    quotation: frm.doc.name,
                                    despatched_through: frm.doc.custom_despatched_through,
                                    currency: frm.doc.currency,
                                    tax_category: frm.doc.tax_category,
                                    taxes_and_charges: frm.doc.taxes_and_charges,
                                    conversion_rate: frm.doc.conversion_rate,
                                    plc_conversion_rate: frm.doc.plc_conversion_rate,
                                    selling_price_list: frm.doc.selling_price_list,
                                    price_list_currency: frm.doc.price_list_currency,
                                    tc_name: frm.doc.tc_name,
                                    terms: frm.doc.terms,
                                    transaction_date: frappe.datetime.now_date(),
                                    valid_till: frm.doc.valid_till,
                                    contact_person: frm.doc.contact_person,
                                    contact_email: frm.doc.contact_email,
                                    customer_address: frm.doc.customer_address,
                                    shipping_address_name: frm.doc.shipping_address_name,
                                    shipping_address: frm.doc.shipping_address,
                                    payment_terms_template: frm.doc.payment_terms_template,
                                    sales_partner: frm.doc.sales_partner,
                                    campaign: frm.doc.campaign,
                                    remarks: frm.doc.remarks
                                });

                                // Copy Items
                                (frm.doc.items || []).forEach(item => {
                                    let pi_item = frappe.model.add_child(pi, "items");
                                    Object.assign(pi_item, {
                                        item_code: item.item_code,
                                        item_name: item.item_name,
                                        remarks: item.custom_remarks,
                                        packing_type: item.custom_packing_type,
                                        description: item.description,
                                        qty: item.qty,
                                        rate: item.rate,
                                        amount: item.amount,
                                        uom: item.uom,
                                        conversion_factor: item.conversion_factor,
                                        delivery_date: item.delivery_date,
                                        income_account: item.income_account,
                                        cost_center: item.cost_center,
                                        discount_percentage: item.discount_percentage,
                                        quotation_item: item.name,
                                        prevdoc_docname: frm.doc.name
                                    });
                                });

                                // Copy Taxes
                                (frm.doc.taxes || []).forEach(tax => {
                                    let pi_tax = frappe.model.add_child(pi, "taxes");
                                    Object.assign(pi_tax, {
                                        charge_type: tax.charge_type,
                                        account_head: tax.account_head,
                                        cost_center: tax.cost_center,
                                        rate: tax.rate,
                                        tax_amount: tax.tax_amount,
                                        total: tax.total,
                                        description: tax.description
                                    });
                                });

                                // Copy Payment Schedule
                                (frm.doc.payment_schedule || []).forEach(schedule => {
                                    let pi_schedule = frappe.model.add_child(pi, "payment_schedule");
                                    Object.assign(pi_schedule, {
                                        due_date: schedule.due_date,
                                        invoice_portion: schedule.invoice_portion,
                                        payment_amount: schedule.payment_amount,
                                        mode_of_payment: schedule.mode_of_payment,
                                        description: schedule.description
                                    });
                                });

                                frappe.set_route("Form", "Proforma Invoice", pi.name);
                            });
                        }, "Create");
                    } 
                }
            });
        }
    }
});

// Copyright (c) 2026, Rajesh Kumar and contributors
// For license information, please see license.txt

frappe.ui.form.on('Mold Quotation', {

    setup(frm) {
        // 🔹 Filter addresses by selected company
        frm.set_query("company_address", function() {
            return {
                filters: {
                    link_doctype: "Company",
                    link_name: frm.doc.company
                }
            };
        });
    },

    company(frm) {
        // 🔥 Clear fields if company removed
        if (!frm.doc.company) {
            frm.set_value("company_address", "");
            frm.set_value("company_address_display", "");
            return;
        }

        // 🔹 Get default company address
        frappe.call({
            method: "frappe.contacts.doctype.address.address.get_default_address",
            args: {
                doctype: "Company",
                name: frm.doc.company
            },
            callback: function(r) {
                if (r.message) {
                    frm.set_value("company_address", r.message);
                }
            }
        });
    },

    company_address(frm) {
        // 🔹 Render address display
        if (!frm.doc.company_address) {
            frm.set_value("company_address_display", "");
            return;
        }

        frappe.call({
            method: "frappe.contacts.doctype.address.address.get_address_display",
            args: {
                address_dict: frm.doc.company_address
            },
            callback: function(res) {
                if (res.message) {
                    frm.set_value("company_address_display", res.message);
                }
            }
        });
    },

    refresh(frm) {
        // 🔹 Ensure display loads on refresh
        if (frm.doc.company_address) {
            frm.trigger("company_address");
        }
    }
});

frappe.ui.form.on('Mold Quotation', {
    currency: function(frm) {
        // Loop through child table
        (frm.doc.items || []).forEach(function(row) {
            // Set currency for each row
            frappe.model.set_value(row.doctype, row.name, "currency", frm.doc.currency);
        });

        // Refresh child table
        frm.refresh_field("items");
    }
});

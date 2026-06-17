frappe.ui.form.on("Prospect", {
    refresh: function(frm) {
        frm.add_custom_button("Quotation", function() {
            frappe.model.with_doctype("Quotation", function() {
                // Create new Quotation document
                let quotation = frappe.model.get_new_doc("Quotation");

                // Check if necessary fields are available
                if (!frm.doc.company_name) {
                    frappe.msgprint(__('Company Name is required.'));
                    return;
                }

                // Map values from Prospect to Quotation
                quotation.quotation_to = "Prospect";  // Adjust based on your needs
                quotation.party_name = frm.doc.company_name; // Mapping customer name
                quotation.company_address = frm.doc.company;
                // Open the newly created Quotation document
                frappe.set_route("Form", "Quotation", quotation.name);
            });
        }, "Create");
    }
});

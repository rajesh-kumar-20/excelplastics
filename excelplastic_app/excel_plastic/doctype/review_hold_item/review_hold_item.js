// Copyright (c) 2026, Rajesh Kumar and contributors
// For license information, please see license.txt

frappe.ui.form.on("Review Hold Item", {
    refresh: function(frm) {

        let hold_qty = flt(frm.doc.hold_qty || 0);
        let accepted_qty = flt(frm.doc.accepted_qty || 0);
        let rejected_qty = flt(frm.doc.rejected_qty || 0);

        // Show button only if review is incomplete
        if (hold_qty > 0 && (accepted_qty + rejected_qty) < hold_qty) {

            frm.add_custom_button("Review Item", function() {

                let dialog = new frappe.ui.Dialog({
                    title: "Review Hold Item",
                    fields: [
                        {
                            label: "Accepted Qty",
                            fieldname: "accepted_qty",
                            fieldtype: "Float",
                            default: accepted_qty
                        },
                        {
                            label: "Rejected Qty",
                            fieldname: "rejected_qty",
                            fieldtype: "Float",
                            default: rejected_qty
                        }
                    ],
                    primary_action_label: "Update",
                    primary_action: function(values) {

                        let total = flt(values.accepted_qty) + flt(values.rejected_qty);
                        if (total > hold_qty) {
                            frappe.msgprint("Accepted Qty + Rejected Qty cannot exceed Hold Qty");
                            return;
                        }

                        frm.set_value("accepted_qty", values.accepted_qty);
                        frm.set_value("rejected_qty", values.rejected_qty);

                        dialog.hide();

                        frm.save().then(function() {
                            if (total === hold_qty) {
                                frappe.show_alert({
                                    message: "Review completed",
                                    indicator: "green"
                                });
                            }
                            frm.reload_doc();
                        });

                    }
                });

                dialog.show();

            });

        }

    },
    // refresh(frm) {
    //     // Remove default docstatus indicator
    //     frm.page.clear_indicator();

    //     // Show custom status instead
    //     if (frm.doc.status) {
    //         let color = "blue";

    //         if (frm.doc.status === "Completed") color = "green";
    //         else if (frm.doc.status === "Rejected") color = "red";
    //         else if (frm.doc.status === "Pending") color = "orange";

    //         frm.page.set_indicator(frm.doc.status, color);
    //     }
    // }
});

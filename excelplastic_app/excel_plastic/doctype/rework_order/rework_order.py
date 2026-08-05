# Copyright (c) 2026, Rajesh Kumar and contributors
# For license information, please see license.txt

# import frappe
import frappe
from frappe.model.document import Document


class ReworkOrder(Document):

    def on_submit(self):
        total_split_qty = (
            float(self.accepted_qty or 0) +
            float(self.rejected_qty or 0)
        )

        if total_split_qty <= 0:
            frappe.throw("Accepted or Rejected must be greater than zero.")

        # Optional validation
        if total_split_qty != float(self.rework_qty or 0):
            frappe.throw("Accepted + Rejected must equal to Hold Qty.")

        item_code = self.item
        source_wh = self.source_warehouse

        # Create Stock Entry
        if float(self.accepted_qty or 0) > 0:
            se = frappe.new_doc("Stock Entry")
            se.stock_entry_type = "Material Transfer"
            se.purpose = "Material Transfer"
            se.company = self.company
            se.remarks = "Auto created from Quality Inspection " + self.name
            se.custom_rework_order = self.name

            # Accepted Qty
            se.append("items", {
                "item_code": item_code,
                "qty": float(self.accepted_qty),
                "s_warehouse": source_wh,
                "t_warehouse": self.accepted_warehouse
            })

            se.insert(ignore_permissions=True)

        # Rejected Qty
        if float(self.rejected_qty or 0) > 0:
            r_se = frappe.new_doc("Stock Entry")
            r_se.stock_entry_type = "Material Transfer"
            r_se.purpose = "Material Transfer"
            r_se.company = self.company
            r_se.remarks = "Auto created from Rework Order " + self.name
            r_se.custom_rework_order = self.name

            r_se.append("items", {
                "item_code": item_code,
                "qty": float(self.rejected_qty),
                "s_warehouse": source_wh,
                "t_warehouse": self.rejected_warehouse
            })

            try:
                rri = frappe.new_doc("Review Rejected Item")

                # Link references
                rri.date = frappe.utils.nowdate()
                rri.reference_type = "Rework Order"
                rri.reference_name = self.name
                rri.item = self.item
                rri.work_order = self.work_order
                rri.job_card = self.job_card
                rri.item_name = self.item_name
                rri.rejected_qty = self.rejected_qty
                rri.source_warehouse = self.rejected_warehouse

                # Prevent permission issues
                rri.insert(ignore_permissions=True)

                # Optional auto submit
                rri.submit()

            except Exception:
                frappe.log_error(
                    title="Review Rejection Item Creation Error",
                    message=frappe.get_traceback()
                )

            if r_se.items:
                r_se.insert(ignore_permissions=True)
                r_se.submit()

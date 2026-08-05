# Copyright (c) 2026, Rajesh Kumar and contributors
# For license information, please see license.txt

# import frappe
import frappe
from frappe.model.document import Document

class ReviewHoldItem(Document):
	def on_submit(self):
		total_split_qty = (
			float(self.accepted_qty or 0) +
			float(self.rejected_qty or 0)
		)

		if total_split_qty <= 0:
			frappe.throw("Accepted or Rejected must be greater than zero.")

		# Optional validation
		if total_split_qty != float(self.hold_qty or 0):
			frappe.throw("Accepted + Rejected must equal to Hold Qty.")

		item_code = self.item
		source_wh = self.source_warehouse

		if float(self.accepted_qty or 0) > 0:
			# Create Stock Entry
			se = frappe.new_doc("Stock Entry")
			se.stock_entry_type = "Material Transfer"
			se.purpose = "Material Transfer"
			# se.company = doc.company
			se.remarks = "Auto created from Review Hold Item " + self.name
			se.custom_review_hold_items = self.name
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
			# r_se.company = doc.company
			r_se.remarks = "Auto created from Quality Inspection " + self.name
			r_se.custom_review_hold_items = self.name

			if self.rework_possible == 0:
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
					rri.reference_type = "Review Hold Item"
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
			else:
				r_se.append("items", {
					"item_code": item_code,
					"qty": float(self.rejected_qty),
					"s_warehouse": source_wh,
					"t_warehouse": self.rework_warehouse
				})
				try:
					rw = frappe.new_doc("Rework Order")
					# Link references
					rw.date = frappe.utils.nowdate()
					rw.reference_type = "Review Hold Item"
					rw.reference_name = self.name
					rw.item = self.item
					rw.work_order = self.work_order
					rw.job_card = self.job_card
					rw.item_name = self.item_name
					rw.rejected_qty = self.rejected_qty
					rw.source_warehouse = self.rework_warehouse
					# Prevent permission issues
					rw.insert(ignore_permissions=True)
			
					# Optional auto submit
					# rri.submit()
			
				except Exception:
					frappe.log_error(
						title="Review Rejection Item Creation Error",
						message=frappe.get_traceback()
					) 
			if r_se.items:
				r_se.insert(ignore_permissions=True)
				r_se.submit()
			

				

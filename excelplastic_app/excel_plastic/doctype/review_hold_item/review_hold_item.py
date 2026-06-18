# Copyright (c) 2026, Rajesh Kumar and contributors
# For license information, please see license.txt

# import frappe
import frappe
from frappe.model.document import Document

class ReviewHoldItem(Document):

    def on_submit(self):
		total_split_qty = (
			float(doc.accepted_qty or 0) +
			float(doc.rejected_qty or 0)
		)

		if total_split_qty <= 0:
			frappe.throw("Accepted or Rejected must be greater than zero.")

		# Optional validation
		if total_split_qty != float(doc.hold_qty or 0):
			frappe.throw("Accepted + Rejected must equal to Hold Qty.")

		item_code = doc.item
		source_wh = doc.source_warehouse

		if float(doc.accepted_qty or 0) > 0:
			# Create Stock Entry
			se = frappe.new_doc("Stock Entry")
			se.stock_entry_type = "Material Transfer"
			se.purpose = "Material Transfer"
			se.company = doc.company
			se.remarks = "Auto created from Quality Inspection " + doc.name
			se.custom_review_hold_items = doc.name
			# Accepted Qty
			se.append("items", {
				"item_code": item_code,
				"qty": float(doc.accepted_qty),
				"s_warehouse": source_wh,
				"t_warehouse": doc.accepted_warehouse
			})
			se.insert(ignore_permissions=True)
		# Rejected Qty
		if float(doc.rejected_qty or 0) > 0:
			r_se = frappe.new_doc("Stock Entry")
			r_se.stock_entry_type = "Material Transfer"
			r_se.purpose = "Material Transfer"
			r_se.company = doc.company
			r_se.remarks = "Auto created from Quality Inspection " + doc.name
			r_se.custom_review_hold_items = doc.name

			if doc.rework_possible == 0:
				r_se.append("items", {
					"item_code": item_code,
					"qty": float(doc.rejected_qty),
					"s_warehouse": source_wh,
					"t_warehouse": doc.rejected_warehouse
				})
				try:
					rri = frappe.new_doc("Review Rejected Item")
					# Link references
					rri.date = frappe.utils.nowdate()
					rri.reference_type = "Review Hold Item"
					rri.reference_name = doc.name
					rri.item = doc.item
					rri.work_order = doc.work_order
					rri.job_card = doc.job_card
					rri.item_name = doc.item_name
					rri.rejected_qty = doc.rejected_qty
					rri.source_warehouse = doc.rejected_warehouse
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
					"qty": float(doc.rejected_qty),
					"s_warehouse": source_wh,
					"t_warehouse": doc.rework_warehouse
				})
				try:
					rw = frappe.new_doc("Rework Order")
					# Link references
					rw.date = frappe.utils.nowdate()
					rw.reference_type = "Review Hold Item"
					rw.reference_name = doc.name
					rw.item = doc.item
					rw.work_order = doc.work_order
					rw.job_card = doc.job_card
					rw.item_name = doc.item_name
					rw.rejected_qty = doc.rejected_qty
					rw.source_warehouse = doc.rework_warehouse
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
			

				

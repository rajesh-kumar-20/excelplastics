# Copyright (c) 2026, Rajesh Kumar and contributors
# For license information, please see license.txt

# import frappe
import frappe
from frappe.model.document import Document


class LineClearance(Document):

    def before_save(self):
        if not self.checked_by and self.workflow_state == "Approval Pending From Quality":
            self.approved_by = frappe.session.user
            self.checked_by = frappe.session.user
            user = frappe.get_doc("User", frappe.session.user)
            self.checked_by_name = user.full_name
            self.approved_by_name = user.full_name

    def before_submit(self):
        # self.checked_by = frappe.session.user
        self.quality_inspector = frappe.session.user
        user = frappe.get_doc("User", frappe.session.user)
        self.quality_inspector_name = user.full_name
        # self.approved_by_name = user.full_name

        if not self.mold_load_complete_time:
            self.mold_load_complete_time = frappe.utils.now_datetime()
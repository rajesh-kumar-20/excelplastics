# Copyright (c) 2026, Rajesh Kumar and contributors
# For license information, please see license.txt

# import frappe
import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime, nowdate


class MoldChangeOver(Document):

    def validate(self):
        self.set_quality_approval()

    def after_insert(self):
        self.create_line_clearance()
        self.create_quality_inspections()

    def before_submit(self):
        self.set_submission_details()

    def on_trash(self):
        self.restore_machine_mold()

    # ---------------------------------------------------------------------
    # Validate
    # ---------------------------------------------------------------------

    def set_quality_approval(self):
        if (
            not self.checked_by
            and self.workflow_state == "Approval Pending From Quality"
        ):
            self.checked_by = frappe.session.user
            self.approved_by = frappe.session.user

            user = frappe.get_cached_doc("User", frappe.session.user)

            self.checked_by_name = user.full_name
            self.approved_by_name = user.full_name

    # ---------------------------------------------------------------------
    # After Insert
    # ---------------------------------------------------------------------

    def create_line_clearance(self):
        if frappe.db.exists(
            "Line Clearance",
            {"mold_change_over": self.name},
        ):
            return

        cc = frappe.get_doc(
            {
                "doctype": "Line Clearance",
                "date": nowdate(),
                "offloading_start_time": self.mold_unload_start_time,
                "mold_load_complete_time": self.mold_load_complete_time,
                "job_card": self.job_card,
                "operator": self.operator,
                "work_order": self.work_order,
                "mold_change_over": self.name,
                "machine": self.machine_name,
                "new_mold_id": self.mold_no,
                "item": self.item_code,
                "previous_mold": self.unloading_mold_name,
                "new_mold": self.loading_mold_name,
                "offloaded_shifted": 1,
                "loose_parts_check": 1,
                "fit_check": 1,
                "loose_parts": 1,
                "cooling_airline_check": 1,
                "dry_resin": 1,
                "color_mixing": 1,
                "packing_table": 1,
                "packing_place": 1,
                "previous_product": 1,
                "next_product": 1,
                "line_clearance": self.line_clearance,
                "any_defect": 1,
                "customer_complaint": 1,
                "as_per_specification": 1,
                "precaution": 1,
                "packing_as_per_specification": 1,
                "trained_workers": 1,
            }
        )

        cc.insert(ignore_permissions=True)

        frappe.msgprint(
            f"Line Clearance Created: <b>{cc.name}</b>"
        )

    def create_quality_inspections(self):
        templates = [
            "Visual Inspection Report",
            "Dimensional Inspection Report",
        ]

        for template in templates:
            if frappe.db.exists(
                "Quality Inspection",
                {
                    "reference_type": "Job Card",
                    "reference_name": self.job_card,
                    "quality_inspection_template": template,
                },
            ):
                continue

            qi = frappe.get_doc(
                {
                    "doctype": "Quality Inspection",
                    "inspection_type": "In Process",
                    "reference_type": "Job Card",
                    "reference_name": self.job_card,
                    "custom_is_first_set": 1,
                    "custom_workstation": self.machine_name,
                    "item_code": self.item_code,
                    "quality_inspection_template": template,
                    "sample_size": 0,
                    "inspected_by": frappe.session.user,
                }
            )

            qi.insert(ignore_permissions=True)

            frappe.msgprint(
                f"QC created for <b>{template}</b>: <b>{qi.name}</b>"
            )

    # ---------------------------------------------------------------------
    # Before Submit
    # ---------------------------------------------------------------------

    def set_submission_details(self):
        if not self.mold_load_complete_time:
            now = now_datetime()

            self.mold_load_complete_time = now
            self.machine_started_time = now
            self.inspected_by = frappe.session.user

            user = frappe.get_cached_doc(
                "User", frappe.session.user
            )

            self.quality_inspecter_name = user.full_name

    # ---------------------------------------------------------------------
    # Before Delete (on_trash)
    # ---------------------------------------------------------------------

    def restore_machine_mold(self):
        latest = frappe.get_all(
            "Mold Change Over",
            filters={
                "machine_name": self.machine_name,
                "name": ["!=", self.name],
            },
            fields=["name", "mold_no"],
            order_by="creation desc",
            limit=1,
        )

        if latest:
            frappe.db.set_value(
                "Workstation",
                self.machine_name,
                "custom_mold_id",
                latest[0].mold_no,
            )
        else:
            frappe.db.set_value(
                "Workstation",
                self.machine_name,
                "custom_mold_id",
                self.unloading_mold_name or "",
            )

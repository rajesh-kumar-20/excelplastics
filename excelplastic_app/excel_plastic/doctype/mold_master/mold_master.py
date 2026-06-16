# Copyright (c) 2026, Rajesh Kumar and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document
import frappe

class MoldMaster(Document):

    def on_update(self):
        if not self.item_quality_inspection_parameter:
            return

        mold_id = self.name

        linked_items = frappe.get_all(
            "Mold Master Link",
            filters={"mold_id": mold_id},
            fields=["parent"]
        )

        item_names = list(set(row.parent for row in linked_items))

        for item_name in item_names:
            item = frappe.get_doc("Item", item_name)

            item.item_quality_inspection_parameter = []

            for param in self.item_quality_inspection_parameter:
                item.append("item_quality_inspection_parameter", {
                    "specification": param.specification,
                    "numeric": param.numeric,
                    "value": param.value,
                    "min_value": param.min_value,
                    "max_value": param.max_value,
                    "custom_uom": param.custom_uom,
                    "formula_based_criteria": param.formula_based_criteria,
                    "acceptance_formula": param.acceptance_formula,
                })

            item.save(ignore_permissions=True)
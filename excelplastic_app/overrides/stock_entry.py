from erpnext.stock.doctype.stock_entry.stock_entry import StockEntry
import frappe
from frappe import _
from frappe.utils import flt


class CustomStockEntry(StockEntry):

    def check_if_operations_completed(self):
        """Allow partial manufacture while keeping Job Card existence check."""

        prod_order = frappe.get_doc("Work Order", self.work_order)
        allowance_percentage = flt(
            frappe.db.get_single_value(
                "Manufacturing Settings",
                "overproduction_percentage_for_work_order"
            )
        )

        for d in prod_order.get("operations"):
            total_completed_qty = flt(self.fg_completed_qty) + flt(prod_order.produced_qty)
            completed_qty = (
                d.completed_qty + d.process_loss_qty + (allowance_percentage / 100 * d.completed_qty)
            )

            if flt(total_completed_qty, self.precision("fg_completed_qty")) > flt(
                completed_qty, self.precision("fg_completed_qty")
            ):
                job_card = frappe.db.get_value(
                    "Job Card",
                    {"operation_id": d.name},
                    "name"
                )

                if not job_card:
                    frappe.throw(
                        _("Work Order {0}: Job Card not found for the operation {1}").format(
                            self.work_order,
                            d.operation,
                        )
                    )

                # Skip the standard "Operations Not Complete" validation
                continue
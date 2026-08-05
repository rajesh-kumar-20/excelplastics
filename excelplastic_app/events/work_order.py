import frappe
from frappe.utils import ceil

def validate(doc, method):
    set_default_warehouses(doc)
    round_required_qty(doc)

def before_submit(doc, method):
    validate_mold(doc)

# ---------------------------------------------------------------------
# Before Save
# ---------------------------------------------------------------------

def set_default_warehouses(doc):
    if doc.docstatus != 0:
        return

    doc.fg_warehouse = frappe.db.get_single_value(
        "Manufacturing Settings",
        "default_fg_warehouse",
    )

    doc.wip_warehouse = frappe.db.get_single_value(
        "Manufacturing Settings",
        "default_wip_warehouse",
    )

    doc.scrap_warehouse = frappe.db.get_single_value(
        "Manufacturing Settings",
        "default_scrap_warehouse",
    )

    doc.custom_hold_warehouse = frappe.db.get_single_value(
        "Additional Manufacturing Settings",
        "default_hold_warehouse",
    )

def round_required_qty(doc):
    if doc.docstatus != 0:
        return

    for row in doc.required_items:
        if (
            row.stock_uom == "Nos"
            and row.required_qty
            and row.required_qty % 1 != 0
        ):
            row.required_qty = ceil(row.required_qty)

# ---------------------------------------------------------------------
# Before Submit
# ---------------------------------------------------------------------

def validate_mold(doc):
    if not doc.custom_mold_id:
        frappe.throw("Please Select the Mold for this Item")

    mold = frappe.get_cached_doc("Mold Master", doc.custom_mold_id)

    if mold.status != "Available":
        frappe.throw(
            f"Selected Mold <b>{mold.name}</b> is under <b>{mold.status}</b>"
        )
import frappe
from frappe.utils import ceil


# ============================================================
# Events
# ============================================================

def validate(doc, method):
    round_quantities(doc)


def on_update(doc, method):
    create_quality_inspections(doc)


def on_trash(doc, method):
    delete_quality_inspections(doc)


# ============================================================
# Before Save
# ============================================================

def round_quantities(doc):
    if doc.docstatus != 0:
        return

    for row in doc.items:
        if (
            row.uom == "Nos"
            and row.qty
            and row.qty % 1 != 0
        ):
            row.qty = ceil(row.qty)
            row.stock_qty = row.qty


# ============================================================
# After Save
# ============================================================

def create_quality_inspections(doc):

    if not doc.inspection_required:
        return

    inspection_type = get_inspection_type(doc)

    for row in doc.items:

        if not row.item_code:
            continue

        # Ignore source row during Manufacture
        if (
            doc.stock_entry_type == "Manufacture"
            and not row.t_warehouse
        ):
            continue

        exists = frappe.db.exists(
            "Quality Inspection",
            {
                "reference_type": "Stock Entry",
                "reference_name": doc.name,
                "item_code": row.item_code,
            },
        )

        if exists:
            continue

        qi = frappe.new_doc("Quality Inspection")

        qi.item_code = row.item_code
        qi.reference_type = "Stock Entry"
        qi.reference_name = doc.name

        qi.custom_work_order = doc.work_order
        qi.custom_job_card = doc.custom_jobcard

        qi.inspection_type = inspection_type
        qi.custom_production_qty = doc.fg_completed_qty
        qi.sample_size = 0
        qi.remarks = (
            f"Auto created from Stock Entry {doc.name}"
        )

        qi.uom = row.uom
        qi.batch_no = row.batch_no
        qi.inspected_by = frappe.session.user
        qi.custom_is_final_inspection = 1
        qi.insert(ignore_permissions=True)
# ============================================================
# Before Delete
# ============================================================
def delete_quality_inspections(doc):

    inspections = frappe.get_all(
        "Quality Inspection",
        filters={
            "reference_type": "Stock Entry",
            "reference_name": doc.name,
            "docstatus": ["<", 2],
        },
        pluck="name",
    )

    for qi_name in inspections:

        qi = frappe.get_doc(
            "Quality Inspection",
            qi_name,
        )

        if qi.docstatus == 0:
            frappe.delete_doc(
                "Quality Inspection",
                qi.name,
                force=True,
            )
# ============================================================
# Helpers
# ============================================================
def get_inspection_type(doc):
    if doc.stock_entry_type == "Material Receipt":
        return "Incoming"
    if doc.stock_entry_type == "Material Transfer":
        return "Outgoing"

    return "In Process"
import frappe
from frappe.utils import flt

def before_save(doc, method=None):
    update_running_cavity(doc)
    create_or_update_stock_entries(doc)
    update_mold_status(doc)
    # validate_overproduction(doc)

def before_cancel(doc, method=None):
    cleanup_related_documents(doc)

# ============================================================================
# RUNNING CAVITY
# ============================================================================

def update_running_cavity(doc):
    try:
        running_cavity = float(doc.custom_running_cavity or 0)
    except Exception:
        running_cavity = 0.0

    if running_cavity:
        return

    cavity_input = doc.custom_cavity

    if not cavity_input:
        doc.custom_running_cavity = 0.0
        return

    if "+" in str(cavity_input):

        total = 0
        for part in str(cavity_input).split("+"):
            part = part.strip()

            if part:
                try:
                    total += float(part)
                except Exception:
                    pass

        doc.custom_running_cavity = total

    else:

        try:
            doc.custom_running_cavity = float(cavity_input)
        except Exception:
            doc.custom_running_cavity = 0.0

# ============================================================================
# STOCK ENTRY
# ============================================================================

def create_or_update_stock_entries(doc):

    old_doc = doc.get_doc_before_save()
    for row in doc.time_logs:
        # -------------------------
        # New Row
        # -------------------------
        if row.completed_qty > 0 and not row.custom_stock_entry:

            se = make_stock_entry(doc, row)
            row.custom_stock_entry = se.name

        # -------------------------
        # Existing Row
        # -------------------------
        elif old_doc and row.custom_stock_entry:
            old_row = next(
                (d for d in old_doc.time_logs if d.name == row.name),
                None
            )
            if (
                old_row
                and old_row.completed_qty != row.completed_qty
            ):
                old_se = frappe.get_doc(
                    "Stock Entry",
                    row.custom_stock_entry
                )
                if old_se.docstatus == 1:
                    old_se.cancel()
                    old_se.db_set("workflow_state", "Cancelled")
                se = make_stock_entry(doc, row)
                row.custom_stock_entry = se.name
    # -------------------------
    # Deleted Rows
    # -------------------------

    if not old_doc:
        return

    current_rows = [d.name for d in doc.time_logs]

    for old_row in old_doc.time_logs:
        if old_row.name not in current_rows:

            # -------------------------
            # Stock Entry
            # -------------------------
            if old_row.custom_stock_entry:
                se = frappe.get_doc(
                    "Stock Entry",
                    old_row.custom_stock_entry
                )

                if se.docstatus == 1:
                    se.cancel()
                    se.db_set("workflow_state", "Cancelled")

            # -------------------------
            # Mold Change Over
            # -------------------------
            if old_row.custom_mold_change_over:
                mco = frappe.get_doc(
                    "Mold Change Over",
                    old_row.custom_mold_change_over
                )

                if mco.docstatus == 0:
                    frappe.delete_doc(
                        "Mold Change Over",
                        mco.name,
                        force=1
                    )

                elif mco.docstatus == 1:
                    mco.cancel()


def make_stock_entry(doc, row):

    work_order = frappe.get_doc("Work Order", doc.work_order)

    se = frappe.new_doc("Stock Entry")
    se.stock_entry_type = "Manufacture"
    se.purpose = "Manufacture"
    se.inspection_required = 1
    se.custom_jobcard = doc.name
    se.company = work_order.company
    se.work_order = work_order.name
    se.from_bom = 1
    se.bom_no = doc.bom_no
    se.use_multi_level_bom = work_order.use_multi_level_bom
    se.remarks = f"Auto created from Job Card {doc.name}"
    se.fg_completed_qty = row.completed_qty
    se.set_stock_entry_type()
    se.get_items()
    se.insert(ignore_permissions=True)
    se.reload()
    se.submit()

    return se

# ============================================================================
# MOLD STATUS
# ============================================================================

def update_mold_status(doc):

    if not doc.has_value_changed("status"):
        return

    if not doc.workstation:
        return

    workstation = frappe.get_doc("Workstation", doc.workstation)

    if not workstation.custom_mold_id:
        return

    if doc.status == "Work In Progress":

        frappe.db.set_value("Mold Master", workstation.custom_mold_id, "status", "Production")

    elif doc.status in ("Completed", "Cancelled", "Open"):

        frappe.db.set_value("Mold Master", workstation.custom_mold_id, "status", "Available")

# ============================================================================
# BEFORE CANCEL
# ============================================================================

def cleanup_related_documents(doc):

    doctypes = [
        ("Stock Entry", "custom_jobcard"),
        ("Quality Inspection", "custom_job_card"),
        ("Line Clearance", "job_card"),
        ("Mold Change Over", "job_card"),
    ]

    for doctype, field in doctypes:

        docs = frappe.get_all(
            doctype,
            filters={
                field: doc.name,
                "docstatus": ["<", 2]
            },
            fields=["name", "docstatus"]
        )

        for d in docs:

            document = frappe.get_doc(doctype, d.name)

            if document.docstatus == 1:
                document.cancel()

            frappe.delete_doc(doctype, document.name, force=1)

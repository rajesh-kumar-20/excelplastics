import frappe
from frappe.utils import flt


# ============================================================================
# 1. BEFORE SAVE
# ============================================================================
# Migrated from:
# Job Card for Workstation
# Event: Before Save
#
# Handles:
#   - Running Cavity
#   - Mold Status
# ============================================================================

def before_save(doc, method=None):
    update_running_cavity(doc)
    update_mold_status(doc)


# ============================================================================
# RUNNING CAVITY
# ============================================================================

def update_running_cavity(doc):

    try:
        running_cavity = float(doc.custom_running_cavity or 0)
    except Exception:
        running_cavity = 0.0

    # Do not recalculate if running cavity already has a value
    if running_cavity:
        return

    cavity_input = doc.custom_cavity

    # No cavity input
    if not cavity_input:
        doc.custom_running_cavity = 0.0
        return

    # Handle values such as:
    # 2+2
    # 2+2+1
    # 2.5+1.5
    if "+" in str(cavity_input):

        total = 0.0

        for part in str(cavity_input).split("+"):

            clean_part = part.strip()

            if not clean_part:
                continue

            try:
                total += float(clean_part)
            except Exception:
                # Ignore invalid parts
                pass

        doc.custom_running_cavity = total

    else:

        # Handle normal values such as:
        # 4
        # 4.5
        try:
            doc.custom_running_cavity = float(
                str(cavity_input).strip()
            )
        except Exception:
            doc.custom_running_cavity = 0.0


# ============================================================================
# MOLD STATUS
# ============================================================================

def update_mold_status(doc):

    # Run only when Job Card status changes
    if not doc.has_value_changed("status"):
        return

    if not doc.workstation:
        return

    workstation = frappe.get_doc(
        "Workstation",
        doc.workstation
    )

    if not workstation.custom_mold_id:
        return

    # Job Card started
    if doc.status == "Work In Progress":

        frappe.db.set_value(
            "Mold Master",
            workstation.custom_mold_id,
            "status",
            "Production"
        )

    # Job Card completed / cancelled / opened again
    elif doc.status in (
        "Completed",
        "Cancelled",
        "Open",
    ):

        frappe.db.set_value(
            "Mold Master",
            workstation.custom_mold_id,
            "status",
            "Available"
        )


# ============================================================================
# 2. AFTER SAVE
# ============================================================================
# Migrated from:
# Job Card Qty Validate
# Event: After Save
#
# Handles:
#   - Amended Job Card quantity
#   - Remaining quantity in draft Job Card
# ============================================================================

def after_save(doc, method=None):
    validate_amended_job_card_qty(doc)


def validate_amended_job_card_qty(doc):

    # Run only for amended Job Cards having a Work Order
    if not doc.amended_from:
        return

    if not doc.work_order:
        return

    # ------------------------------------------------------------------------
    # Get Work Order quantity
    # ------------------------------------------------------------------------

    wo_qty = flt(
        frappe.db.get_value(
            "Work Order",
            doc.work_order,
            "qty"
        ) or 0
    )

    # ------------------------------------------------------------------------
    # Sum of OTHER submitted Job Cards
    # ------------------------------------------------------------------------

    submitted_total = frappe.db.sql(
        """
        SELECT SUM(for_quantity)
        FROM `tabJob Card`
        WHERE work_order = %s
        AND docstatus = 1
        AND name != %s
        """,
        (
            doc.work_order,
            doc.name,
        )
    )[0][0] or 0

    submitted_total = flt(submitted_total)

    # ------------------------------------------------------------------------
    # Add current amended Job Card quantity
    # ------------------------------------------------------------------------

    submitted_total += flt(
        doc.for_quantity or 0
    )

    # ------------------------------------------------------------------------
    # Get draft Job Cards excluding current document
    # ------------------------------------------------------------------------

    draft_cards = frappe.get_all(
        "Job Card",
        filters={
            "work_order": doc.work_order,
            "docstatus": 0,
            "name": ["!=", doc.name],
        },
        fields=[
            "name",
            "for_quantity",
        ],
        order_by="creation asc",
    )

    # No draft Job Card to adjust
    if not draft_cards:
        return

    # More than one draft is unsafe to adjust automatically
    if len(draft_cards) > 1:

        frappe.throw(
            "Multiple Job Cards found. Cannot auto-adjust safely."
        )

    draft_card = draft_cards[0]

    draft_name = draft_card.name

    draft_qty = flt(
        draft_card.for_quantity or 0
    )

    # ------------------------------------------------------------------------
    # Calculate current total
    # ------------------------------------------------------------------------

    current_total = submitted_total + draft_qty

    if current_total == wo_qty:
        return

    # ------------------------------------------------------------------------
    # Calculate remaining quantity
    # ------------------------------------------------------------------------

    new_remaining = wo_qty - submitted_total

    if new_remaining < 0:

        frappe.throw(
            "Overproduction detected after amendment."
        )

    # ------------------------------------------------------------------------
    # Update remaining draft Job Card
    # ------------------------------------------------------------------------

    frappe.db.set_value(
        "Job Card",
        draft_name,
        "for_quantity",
        new_remaining,
        update_modified=False,
    )


# ============================================================================
# 3. AFTER SUBMIT
# ============================================================================
# Migrated from:
# Job card
# Event: After Submit
#
# Handles:
#   - Manufacture Stock Entry creation
# ============================================================================

def after_submit(doc, method=None):
    create_manufacture_stock_entry(doc)


def create_manufacture_stock_entry(doc):

    # ------------------------------------------------------------------------
    # Job Card must be linked to Work Order
    # ------------------------------------------------------------------------

    if not doc.work_order:

        frappe.throw(
            "Job Card is not linked to a Work Order"
        )

    # ------------------------------------------------------------------------
    # Calculate FG quantity
    # ------------------------------------------------------------------------

    completed_qty = flt(
        doc.total_completed_qty or 0
    )

    rejected_qty = flt(
        doc.custom_rejection or 0
    )

    # Original Server Script uses completed quantity only.
    # Rejected quantity is intentionally not included.
    fg_qty = completed_qty

    if fg_qty <= 0:

        frappe.throw(
            "Manufacturing Quantity must be greater than zero"
        )

    # ------------------------------------------------------------------------
    # Fetch Work Order
    # ------------------------------------------------------------------------

    work_order = frappe.get_doc(
        "Work Order",
        doc.work_order
    )

    # ------------------------------------------------------------------------
    # Create Manufacture Stock Entry
    # ------------------------------------------------------------------------

    se = frappe.new_doc("Stock Entry")

    se.stock_entry_type = "Manufacture"
    se.purpose = "Manufacture"

    se.custom_jobcard = doc.name

    se.company = work_order.company
    se.work_order = work_order.name

    se.inspection_required = 1

    # ------------------------------------------------------------------------
    # BOM Details
    # ------------------------------------------------------------------------

    se.from_bom = 1
    se.bom_no = doc.bom_no
    se.use_multi_level_bom = work_order.use_multi_level_bom

    se.remarks = f"Auto created from Job Card {doc.name}"

    # ------------------------------------------------------------------------
    # Manufacturing Quantity
    # ------------------------------------------------------------------------

    se.fg_completed_qty = fg_qty

    # ------------------------------------------------------------------------
    # Load BOM Items
    # ------------------------------------------------------------------------

    se.set_stock_entry_type()
    se.get_items()

    # ------------------------------------------------------------------------
    # Fix Stock Entry Items Using Work Order Required Items
    # ------------------------------------------------------------------------

    for se_item in se.items:

        # Finished item does not need source warehouse
        if se_item.is_finished_item:
            continue

        # If source warehouse is already available, keep it
        if se_item.s_warehouse:
            continue

        # --------------------------------------------------------------
        # Find corresponding Work Order Required Item
        # --------------------------------------------------------------

        wo_item = None

        for required_item in work_order.required_items:

            if required_item.idx == se_item.idx:

                wo_item = required_item
                break

        # No matching Work Order item
        if not wo_item:
            continue

        # --------------------------------------------------------------
        # Use Work Order item
        # --------------------------------------------------------------

        se_item.item_code = wo_item.item_code

        # --------------------------------------------------------------
        # Use Work Order source warehouse
        # --------------------------------------------------------------

        se_item.s_warehouse = wo_item.source_warehouse

        if not se_item.s_warehouse:

            frappe.throw(
                "Source Warehouse is missing for Work Order item "
                + wo_item.item_code
                + " in row "
                + str(wo_item.idx)
            )

    # ------------------------------------------------------------------------
    # Create and Submit Stock Entry
    # ------------------------------------------------------------------------

    se.insert(
        ignore_permissions=True
    )

    se.reload()

    se.submit()


# ============================================================================
# 4. BEFORE CANCEL
# ============================================================================
# Migrated from:
# Job Card Cancelling
# Event: Before Cancel
#
# Handles:
#   - Draft Stock Entry deletion
#   - Draft Quality Inspection deletion
#   - Draft Line Clearance deletion
#   - Draft Mold Change Over deletion
#
# IMPORTANT:
# The original Server Script only deletes DRAFT documents.
# Submitted documents are not cancelled/deleted here.
# ============================================================================

def before_cancel(doc, method=None):
    cleanup_related_documents(doc)


def cleanup_related_documents(doc):

    # ------------------------------------------------------------------------
    # Find Stock Entries
    # ------------------------------------------------------------------------

    stock_entries = frappe.get_all(
        "Stock Entry",
        filters={
            "custom_jobcard": doc.name,
            "docstatus": ["<", 2],
        },
        fields=[
            "name",
            "docstatus",
        ],
    )

    # ------------------------------------------------------------------------
    # Find Quality Inspections
    # ------------------------------------------------------------------------

    quality_inspections = frappe.get_all(
        "Quality Inspection",
        filters={
            "custom_job_card": doc.name,
            "docstatus": ["<", 2],
        },
        fields=[
            "name",
            "docstatus",
        ],
    )

    # ------------------------------------------------------------------------
    # Find Line Clearances
    # ------------------------------------------------------------------------

    line_clearances = frappe.get_all(
        "Line Clearance",
        filters={
            "job_card": doc.name,
            "docstatus": ["<", 2],
        },
        fields=[
            "name",
            "docstatus",
        ],
    )

    # ------------------------------------------------------------------------
    # Find Mold Change Overs
    # ------------------------------------------------------------------------

    mold_change_overs = frappe.get_all(
        "Mold Change Over",
        filters={
            "job_card": doc.name,
            "docstatus": ["<", 2],
        },
        fields=[
            "name",
            "docstatus",
        ],
    )

    # ------------------------------------------------------------------------
    # Delete Draft Mold Change Overs
    # ------------------------------------------------------------------------

    for row in mold_change_overs:

        if row.docstatus != 0:
            continue

        frappe.delete_doc(
            "Mold Change Over",
            row.name,
            force=True,
        )

    # ------------------------------------------------------------------------
    # Delete Draft Line Clearances
    # ------------------------------------------------------------------------

    for row in line_clearances:

        if row.docstatus != 0:
            continue

        frappe.delete_doc(
            "Line Clearance",
            row.name,
            force=True,
        )

    # ------------------------------------------------------------------------
    # Delete Draft Quality Inspections
    # ------------------------------------------------------------------------

    for row in quality_inspections:

        if row.docstatus != 0:
            continue

        frappe.delete_doc(
            "Quality Inspection",
            row.name,
            force=True,
        )

    # ------------------------------------------------------------------------
    # Delete Draft Stock Entries
    # ------------------------------------------------------------------------

    for row in stock_entries:

        if row.docstatus != 0:
            continue

        frappe.delete_doc(
            "Stock Entry",
            row.name,
            force=True,
        )
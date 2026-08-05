import frappe
from frappe.utils import nowdate, flt

# ============================================================
# Events
# ============================================================

def before_insert(doc, method):
    set_default_warehouses(doc)


def before_submit(doc, method):
    set_inspector(doc)
    validate_before_submit(doc)


def on_submit(doc, method):
    submit_first_piece_documents(doc)
    sync_mco_from_quality_inspection(doc)

    if doc.custom_is_final_inspection:
        process_final_inspection(doc)


# ============================================================
# Before Insert
# ============================================================

def set_default_warehouses(doc):
    doc.custom_source_warehouse = frappe.db.get_single_value(
        "Manufacturing Settings",
        "default_fg_warehouse",
    )

    doc.custom_scrap_warehouse = frappe.db.get_single_value(
        "Manufacturing Settings",
        "default_scrap_warehouse",
    )

    doc.custom_hold_warehouse = frappe.db.get_single_value(
        "Additional Manufacturing Settings",
        "default_hold_warehouse",
    )

    doc.custom_rework_warehouse = frappe.db.get_single_value(
        "Additional Manufacturing Settings",
        "default_rework_warehouse",
    )

    doc.custom_accepted_warehouse = frappe.db.get_single_value(
        "Additional Manufacturing Settings",
        "default_accepted_warehouse",
    )


# ============================================================
# Before Submit
# ============================================================

def set_inspector(doc):
    doc.inspected_by = frappe.session.user

    user = frappe.get_cached_doc(
        "User",
        frappe.session.user,
    )

    doc.custom_name = user.full_name


def validate_before_submit(doc):

    if not doc.sample_size or doc.sample_size <= 0:
        frappe.throw("Sample Size must be greater than 0.")

    if doc.reference_type == "Job Card":

        if not doc.custom_running_cavity:
            frappe.throw(
                "Please Enter the Running Cavity"
            )

        if not doc.custom_act_cycle_time:
            frappe.throw(
                "Please Enter the Actual Cycle Time"
            )

    # if doc.status == "Hold":
    #     frappe.throw(
    #         title="Blocked Action",
    #         msg="Quality Inspection is currently on Hold. Please resolve it before proceeding.",
    #     )

    if doc.sample_size <= 0:
        frappe.throw("Sample size cannot be 0")


# ============================================================
# Submit First Piece Documents
# ============================================================

def submit_first_piece_documents(doc):

    if not (
        doc.custom_is_first_set
        and doc.quality_inspection_template == "Visual Inspection Report"
    ):
        return

    mco_name = frappe.db.get_value(
        "Mold Change Over",
        {"job_card": doc.reference_name},
        "name",
    )

    if not mco_name:
        return

    lc_name = frappe.db.get_value(
        "Line Clearance",
        {"mold_change_over": mco_name},
        "name",
    )

    if lc_name:

        if frappe.db.get_value(
            "Line Clearance",
            lc_name,
            "docstatus",
        ) == 0:

            frappe.get_doc(
                "Line Clearance",
                lc_name,
            ).submit()

    if frappe.db.get_value(
        "Mold Change Over",
        mco_name,
        "docstatus",
    ) == 0:

        frappe.get_doc(
            "Mold Change Over",
            mco_name,
        ).submit()


# ============================================================
# Sync Running Cavity
# ============================================================

def sync_mco_from_quality_inspection(doc):

    if doc.reference_type != "Job Card":
        return

    if not (
        doc.custom_running_cavity
        and doc.custom_act_cycle_time
    ):
        return

    mco_name = frappe.db.get_value(
        "Mold Change Over",
        {
            "job_card": doc.reference_name
        },
        "name",
    )

    if not mco_name:
        return

    try:

        mco = frappe.get_doc(
            "Mold Change Over",
            mco_name,
        )

        mco.running_cavity = doc.custom_running_cavity
        mco.act_cycle_time = doc.custom_act_cycle_time

        mco.flags.ignore_permissions = True
        mco.flags.ignore_validate_update_after_submit = True

        mco.save()

    except Exception:
        frappe.log_error(
            frappe.get_traceback(),
            "QI → MCO Sync Error",
        )

# ============================================================
# Final Inspection
# ============================================================

def process_final_inspection(doc):

    validate_final_inspection(doc)

    accepted_se = None

    if flt(doc.custom_accepted_qty) > 0:
        accepted_se = make_stock_entry(doc)

        accepted_se.append(
            "items",
            {
                "item_code": doc.item_code,
                "qty": flt(doc.custom_accepted_qty),
                "s_warehouse": doc.custom_source_warehouse,
                "t_warehouse": doc.custom_accepted_warehouse,
            },
        )

        accepted_se.insert(ignore_permissions=True)
        accepted_se.submit()

    other_se = make_stock_entry(doc)

    process_rejected_qty(doc, other_se)
    process_hold_qty(doc, other_se)

    if other_se.items:
        other_se.insert(ignore_permissions=True)
        other_se.submit()


# ============================================================
# Validation
# ============================================================

def validate_final_inspection(doc):

    total_qty = (
        flt(doc.custom_accepted_qty)
        + flt(doc.custom_rejected_qty)
        + flt(doc.custom_hold_qty)
    )

    if abs(total_qty - flt(doc.custom_production_qty)) > 0.0001:
        frappe.throw(
            "Accepted, Rejected and Hold Qty must equal Production Qty."
        )

    if total_qty <= 0:
        frappe.throw(
            "Accepted, Rejected or Hold Qty must be greater than zero."
        )


# ============================================================
# Accepted Qty
# ============================================================

def make_stock_entry(doc):

    se = frappe.new_doc("Stock Entry")

    se.stock_entry_type = "Material Transfer"
    se.purpose = "Material Transfer"

    se.company = doc.company

    se.custom_quality_inspection = doc.name

    se.remarks = (
        f"Auto created from Quality Inspection {doc.name}"
    )

    return se


# ============================================================
# Rejected Qty
# ============================================================

def process_rejected_qty(doc, stock_entry):

    rejected_qty = flt(doc.custom_rejected_qty)

    if rejected_qty <= 0:
        return

    if doc.custom_rework_possible:

        stock_entry.append(
            "items",
            {
                "item_code": doc.item_code,
                "qty": rejected_qty,
                "s_warehouse": doc.custom_source_warehouse,
                "t_warehouse": doc.custom_rework_warehouse,
            },
        )

        create_rework_order(doc)

    else:

        stock_entry.append(
            "items",
            {
                "item_code": doc.item_code,
                "qty": rejected_qty,
                "s_warehouse": doc.custom_source_warehouse,
                "t_warehouse": doc.custom_scrap_warehouse,
            },
        )

        create_review_rejected_item(doc)


# ============================================================
# Hold Qty
# ============================================================

def process_hold_qty(doc, stock_entry):

    hold_qty = flt(doc.custom_hold_qty)

    if hold_qty <= 0:
        return

    stock_entry.append(
        "items",
        {
            "item_code": doc.item_code,
            "qty": hold_qty,
            "s_warehouse": doc.custom_source_warehouse,
            "t_warehouse": doc.custom_hold_warehouse,
        },
    )

    create_review_hold_item(doc)


# ============================================================
# Review Rejected Item
# ============================================================

def create_review_rejected_item(doc):
    try:
        rri = frappe.new_doc("Review Rejected Item")

        rri.date = nowdate()

        rri.reference_type = "Quality Inspection"
        rri.reference_name = doc.name

        rri.work_order = doc.custom_work_order
        rri.job_card = doc.custom_job_card

        rri.item = doc.item_code
        rri.item_name = doc.item_name

        rri.rejected_qty = doc.custom_rejected_qty
        rri.source_warehouse = doc.custom_scrap_warehouse

        rri.insert(ignore_permissions=True)
        rri.submit()

    except Exception:
        frappe.log_error(
            frappe.get_traceback(),
            "Review Rejected Item Creation Error",
        )


# ============================================================
# Review Hold Item
# ============================================================

def create_review_hold_item(doc):
    try:
        rhi = frappe.new_doc("Review Hold Item")

        rhi.date = nowdate()

        rhi.reference_type = "Quality Inspection"
        rhi.reference_name = doc.name

        rhi.work_order = doc.custom_work_order
        rhi.job_card = doc.custom_job_card

        rhi.item = doc.item_code
        rhi.item_name = doc.item_name

        rhi.hold_qty = doc.custom_hold_qty

        rhi.source_warehouse = doc.custom_hold_warehouse

        rhi.accepted_warehouse = doc.custom_accepted_warehouse
        rhi.rejected_warehouse = doc.custom_scrap_warehouse
        rhi.rework_warehouse = doc.custom_rework_warehouse

        rhi.insert(ignore_permissions=True)

    except Exception:
        frappe.log_error(
            frappe.get_traceback(),
            "Review Hold Item Creation Error",
        )


# ============================================================
# Rework Order
# ============================================================

def create_rework_order(doc):
    try:
        rw = frappe.new_doc("Rework Order")

        rw.date = nowdate()

        rw.reference_type = "Quality Inspection"
        rw.reference_name = doc.name

        rw.work_order = doc.custom_work_order
        rw.job_card = doc.custom_job_card

        rw.item = doc.item_code
        rw.item_name = doc.item_name

        rw.source_warehouse = doc.custom_rework_warehouse
        rw.accepted_warehouse = doc.custom_accepted_warehouse
        rw.rejected_warehouse = doc.custom_scrap_warehouse

        rw.rework_qty = doc.custom_rejected_qty

        rw.insert(ignore_permissions=True)

    except Exception:
        frappe.log_error(
            frappe.get_traceback(),
            "Rework Order Creation Error",
        )
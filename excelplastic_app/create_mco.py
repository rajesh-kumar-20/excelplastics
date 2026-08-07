import frappe
from frappe.utils import now_datetime


@frappe.whitelist()
def create_mold_change_over(job_card, operator=None):
    # ---------------------------------------------------------------------
    # Get Job Card & BOM
    # ---------------------------------------------------------------------
    jc = frappe.get_doc("Job Card", job_card)
    bom = frappe.get_doc("BOM", jc.bom_no)

    # ---------------------------------------------------------------------
    # Standard Cycle Time
    # ---------------------------------------------------------------------
    std_cycle_time = 0

    for row in bom.operations:
        if row.operation == jc.operation:
            std_cycle_time = row.operation_time_sec or 0
            break

    # ---------------------------------------------------------------------
    # Material Grade & Master Batch
    # ---------------------------------------------------------------------
    material_grade = ""
    master_batch = ""
    color_percentage = 0

    for rm in bom.items:
        item = frappe.db.get_value(
            "Item",
            rm.item_code,
            [
                "custom_is_material_grade",
                "custom_is_color_grade",
            ],
            as_dict=True,
        )

        if item.custom_is_material_grade and not material_grade:
            material_grade = rm.item_code

        if item.custom_is_color_grade and not master_batch:
            master_batch = rm.item_code
            color_percentage = rm.loading_value or 0

    # ---------------------------------------------------------------------
    # Weight
    # ---------------------------------------------------------------------
    weight = 0

    if jc.production_item:
        weight = (
            frappe.db.get_value(
                "Item",
                jc.production_item,
                "weight_per_unit",
            )
            or 0
        )

    # ---------------------------------------------------------------------
    # Customer & Sales Order
    # ---------------------------------------------------------------------
    customer_code = ""
    sales_order = ""

    if jc.work_order:
        wo = frappe.get_doc("Work Order", jc.work_order)

        sales_order = wo.sales_order or ""

        if sales_order:
            so = frappe.get_doc("Sales Order", sales_order)
            customer_code = so.customer

    # ---------------------------------------------------------------------
    # Active Time Log
    # ---------------------------------------------------------------------
    active_log = next(
        (row for row in jc.time_logs if not row.to_time),
        None,
    )

    start_time = (
        active_log.from_time
        if active_log
        else now_datetime()
    )

    # ---------------------------------------------------------------------
    # Current Mold on Workstation
    # ---------------------------------------------------------------------
    current_mold = (
        frappe.db.get_value(
            "Workstation",
            jc.workstation,
            "custom_mold_id",
        )
        or ""
    )

    # ---------------------------------------------------------------------
    # Prevent duplicate MCO
    # ---------------------------------------------------------------------
    if active_log and active_log.custom_mold_change_over:
        frappe.throw(
            f"This production session already has Mold Change Over "
            f"{active_log.custom_mold_change_over}"
        )

    # ---------------------------------------------------------------------
    # Create Mold Change Over
    # ---------------------------------------------------------------------
    mco = frappe.get_doc({
        "doctype": "Mold Change Over",

        "job_card": jc.name,
        "work_order": jc.work_order,

        "workflow_state": "GM Approval Pending",

        "operation": jc.operation,
        "std_cycle_time": std_cycle_time,

        "date": jc.posting_date,
        "change_date": jc.posting_date,

        "item_code": jc.production_item,

        "unloading_mold_name": current_mold,
        "mold_no": jc.custom_mold,

        "cavity_nos": jc.custom_cavity,
        "total_cavity": jc.custom_cavity,

        "mold_unload_start_time": start_time,

        "machine_name": jc.workstation,
        "machine_running_status": "Ok",

        "material_grade": material_grade,
        "master_batch": master_batch,
        "color": color_percentage,

        "weight": weight,

        "total_quantity": jc.for_quantity,

        "customer_code": customer_code,
        "sales_order": sales_order,

        "operator": operator,

        "quality_approved": "Accepted",
        "line_clearance": 1,
        "first_piece_approval": 1,
    })

    mco.insert()

    # ---------------------------------------------------------------------
    # Update Workstation
    # ---------------------------------------------------------------------
    frappe.db.set_value(
        "Workstation",
        jc.workstation,
        "custom_mold_id",
        jc.custom_mold,
        update_modified=False,
    )

    # ---------------------------------------------------------------------
    # Link MCO to Active Time Log
    # ---------------------------------------------------------------------
    if active_log:
        frappe.db.set_value(
            "Job Card Time Log",
            active_log.name,
            "custom_mold_change_over",
            mco.name,
            update_modified=False
        )

    # ---------------------------------------------------------------------
    # Return
    # ---------------------------------------------------------------------
    return mco.name


@frappe.whitelist()
def validate_mold(job_card):
    jc = frappe.get_doc("Job Card", job_card)

    current_mold = (
        frappe.db.get_value(
            "Workstation",
            jc.workstation,
            "custom_mold_id"
        )
        or ""
    )

    required_mold = jc.custom_mold or ""

    return {
        "changed": current_mold != required_mold,
        "current_mold": current_mold,
        "required_mold": required_mold,
    }


@frappe.whitelist()
def cancel_start_job(job_card):
    jc = frappe.get_doc("Job Card", job_card)

    active_log = next(
        (row for row in jc.time_logs if not row.to_time),
        None
    )

    if active_log:
        jc.time_logs.remove(active_log)
        jc.save(ignore_version=True)

    return True
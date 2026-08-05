import frappe

def before_update_after_submit(doc, method):
    allowed_roles = ["Document Controller"]
    user = frappe.get_cached_doc("User", frappe.session.user)
    user_roles = [d.role for d in user.roles]
    is_allowed = any(role in user_roles for role in allowed_roles)
    # -------------------------------------------------
    # Restrict PO No
    # -------------------------------------------------
    if doc.has_value_changed("po_no"):
        if not doc.has_value_changed("custom_reason_for_update"):
            frappe.throw("Please enter the reason.")
        if not is_allowed:
            frappe.throw("You are not allowed to edit PO No.")
    # -------------------------------------------------
    # Restrict Item Rate
    # -------------------------------------------------
    for item in doc.items:
        if item.has_value_changed("rate"):
            if not is_allowed:
                frappe.throw("You are not allowed to edit Item Rate.")
    # -------------------------------------------------
    # Update Work Orders
    # -------------------------------------------------
    work_orders = frappe.get_all(
        "Work Order",
        filters={"sales_order": doc.name},
        pluck="name",
    )
    for wo_name in work_orders:
        wo = frappe.get_doc("Work Order", wo_name)
        updates = {}
        if wo.custom_lpo_no != doc.po_no:
            updates["custom_lpo_no"] = doc.po_no
        if str(wo.custom_lpo_date) != str(doc.po_date):
            updates["custom_lpo_date"] = doc.po_date
        if updates:
            frappe.db.set_value(
                "Work Order",
                wo.name,
                updates,
                update_modified=False,
            )
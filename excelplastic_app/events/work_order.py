import frappe
from frappe.utils import ceil, flt

def validate(doc, method):
    set_default_warehouses(doc)
    round_required_qty(doc)
    validate_sales_order_work_order_qty(doc)

def before_submit(doc, method):
    validate_mold(doc)

def before_insert(doc, method=None):
    build_customer_details(doc)

# ---------------------------------------------------------------------
# Before Save
# ---------------------------------------------------------------------

def set_default_warehouses(doc):
    if doc.docstatus != 0:
        return

    doc.fg_warehouse = frappe.db.get_single_value("Manufacturing Settings", "default_fg_warehouse",)
    doc.wip_warehouse = frappe.db.get_single_value("Manufacturing Settings", "default_wip_warehouse",)
    doc.scrap_warehouse = frappe.db.get_single_value("Manufacturing Settings", "default_scrap_warehouse",)
    doc.custom_hold_warehouse = frappe.db.get_single_value("Additional Manufacturing Settings", "default_hold_warehouse",)

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

def validate_sales_order_work_order_qty(doc):
    if not doc.sales_order or not doc.sales_order_item:
        return

    sales_order_qty = frappe.db.get_value(
        "Sales Order Item",
        {
            "parent": doc.sales_order,
            "name": doc.sales_order_item,
        },
        "qty",
    )

    if sales_order_qty is None:
        frappe.throw(
            f"Sales Order Item {doc.sales_order_item} "
            f"was not found in Sales Order {doc.sales_order}."
        )

    filters = {
        "sales_order": doc.sales_order,
        "sales_order_item": doc.sales_order_item,
        "docstatus": ("<", 2),
    }

    if not doc.is_new():
        filters["name"] = ("!=", doc.name)

    existing_work_order_qty = frappe.db.get_value(
        "Work Order",
        filters,
        "SUM(qty)",
    ) or 0

    pending_qty = sales_order_qty - existing_work_order_qty

    if doc.qty > pending_qty:
        frappe.throw(
            (
                f"Cannot create Work Order for {doc.qty} units. "
                f"Only {pending_qty} units are pending for "
                f"Sales Order {doc.sales_order}, "
                f"Sales Order Item {doc.sales_order_item}."
            ),
            title="Work Order Quantity Exceeded",
        )

def build_customer_details(doc):

    quantities = {}

    # ========================================================================
    # CASE 1: Work Order created directly from Sales Order
    # ========================================================================

    if doc.sales_order:

        if doc.sales_order_item:

            item = frappe.db.get_value(
                "Sales Order Item",
                doc.sales_order_item,
                [
                    "item_code",
                    "qty",
                ],
                as_dict=True,
            )

            if (
                item
                and item.item_code == doc.production_item
            ):
                quantities[doc.sales_order] = flt(
                    item.qty or 0
                )

        else:

            items = frappe.get_all(
                "Sales Order Item",
                filters={
                    "parent": doc.sales_order,
                    "item_code": doc.production_item,
                },
                fields=["qty"],
            )

            total_qty = 0.0

            for item in items:
                total_qty += flt(
                    item.qty or 0
                )

            if total_qty > 0:
                quantities[doc.sales_order] = total_qty

    # ========================================================================
    # CASE 2: Work Order created from Production Plan
    # ========================================================================

    elif doc.production_plan:

        production_plan = frappe.get_doc(
            "Production Plan",
            doc.production_plan,
        )

        for sales_order_row in production_plan.sales_orders:

            sales_order = sales_order_row.sales_order

            if not sales_order:
                continue

            sales_order_items = frappe.get_all(
                "Sales Order Item",
                filters={
                    "parent": sales_order,
                    "item_code": doc.production_item,
                },
                fields=["qty"],
            )

            for item in sales_order_items:

                qty = flt(
                    item.qty or 0
                )

                quantities[sales_order] = (
                    quantities.get(sales_order, 0)
                    + qty
                )

    # ========================================================================
    # Existing child rows
    # ========================================================================

    existing_rows = {}

    for row in doc.custom_work_order_customer_details:

        if row.sales_order:
            existing_rows[row.sales_order] = row

    # ========================================================================
    # Update / Create child rows
    # ========================================================================

    for sales_order, qty in quantities.items():

        if qty <= 0:
            continue

        # --------------------------------------------------------------------
        # Get Sales Order details
        # --------------------------------------------------------------------

        so_details = frappe.db.get_value(
            "Sales Order",
            sales_order,
            [
                "customer",
                "customer_name",
                "po_no",
                "po_date",
            ],
            as_dict=True,
        )

        # --------------------------------------------------------------------
        # Existing row
        # --------------------------------------------------------------------

        if sales_order in existing_rows:

            row = existing_rows[sales_order]

            # Only update Order Qty.
            # Existing/manual values are preserved.
            row.order_qty = qty

        # --------------------------------------------------------------------
        # New row
        # --------------------------------------------------------------------

        else:

            row = doc.append(
                "custom_work_order_customer_details",
                {},
            )

            row.sales_order = sales_order
            row.order_qty = qty

            # Populate Sales Order details
            if so_details:

                row.customer = so_details.customer
                row.customer_name = so_details.customer_name
                row.po_no = so_details.po_no
                row.po_date = so_details.po_date
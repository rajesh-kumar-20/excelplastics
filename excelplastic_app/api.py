import frappe

@frappe.whitelist()
def get_sales_orders_by_item(item_code, customer=None):
    if not item_code:
        frappe.throw("Missing Item Code.")

    try:
        filters = {"item_code": item_code}
        # Filter Sales Orders by customer if provided
        if customer:
            so_names = frappe.get_all(
                "Sales Order",
                filters={
                    "customer": customer,
                    "docstatus": 1
                },
                pluck="name"
            )

            if not so_names:
                return []

            filters["parent"] = ["in", so_names]

        sales_order_items = frappe.get_all(
            "Sales Order Item",
            filters=filters,
            fields=["*"],
            order_by="creation asc"
        )

        if not sales_order_items:
            return []

        order_map = {}

        for item in sales_order_items:
            try:
                billed_qty = float(item.billed_amt or 0) / float(item.rate or 1)
            except ZeroDivisionError:
                billed_qty = 0

            pending_qty = float(item.qty or 0) - billed_qty

            if pending_qty > 0.01:
                item.qty = pending_qty
                order_map.setdefault(item.parent, []).append(item)

        response = []

        for so_name, items in order_map.items():
            so_doc = frappe.get_doc("Sales Order", so_name)

            response.append({
                "name": so_doc.name,
                "transaction_date": so_doc.transaction_date,
                "customer": so_doc.customer,
                "qty": sum(float(i.qty or 0) for i in items),
                "items": items,
                "sales_order": so_doc.as_dict(),
            })

        return response

    except Exception:
        frappe.log_error(
            frappe.get_traceback(),
            "get_sales_orders_by_item Failed"
        )
        raise


@frappe.whitelist()
def get_purchase_orders_by_item(item_code, supplier=None):
    if not item_code:
        frappe.throw("Missing Item Code.")

    try:
        item_filters = {"item_code": item_code}

        if supplier:
            po_names = frappe.get_all(
                "Purchase Order",
                filters={
                    "supplier": supplier,
                    "docstatus": 1,
                },
                pluck="name",
            )

            if not po_names:
                return []

            item_filters["parent"] = ["in", po_names]

        else:
            submitted_pos = frappe.get_all(
                "Purchase Order",
                filters={"docstatus": 1},
                pluck="name",
            )

            if not submitted_pos:
                return []

            item_filters["parent"] = ["in", submitted_pos]

        po_items = frappe.get_all(
            "Purchase Order Item",
            filters=item_filters,
            fields=["*"],
            order_by="creation asc",
        )

        if not po_items:
            return []

        po_map = {}

        for item in po_items:
            po_map.setdefault(item.parent, []).append(item)

        response = []

        for po_name, items in po_map.items():
            po_doc = frappe.get_doc("Purchase Order", po_name)

            response.append({
                "name": po_doc.name,
                "transaction_date": po_doc.transaction_date,
                "supplier": po_doc.supplier,
                "qty": sum(float(i.qty or 0) for i in items),
                "items": items,
                "purchase_order": po_doc.as_dict(),
            })

        return response

    except Exception:
        frappe.log_error(
            frappe.get_traceback(),
            "get_purchase_orders_by_item Failed",
        )
        raise


@frappe.whitelist()
def has_proforma_invoice(quotation_name):
    """
    Returns the Proforma Invoice name if one exists for the given
    Quotation, otherwise returns None.
    """

    if not quotation_name:
        frappe.throw("Quotation Name is required.")

    try:
        proforma_invoice = frappe.db.sql(
            """
            SELECT pi.name
            FROM `tabProforma Invoice` pi
            INNER JOIN `tabProforma Invoice Item` pii
                ON pii.parent = pi.name
            WHERE pii.prevdoc_docname = %s
              AND pi.docstatus != 2
            LIMIT 1
            """,
            (quotation_name,),
            as_dict=True,
        )

        return proforma_invoice[0].name if proforma_invoice else None

    except Exception:
        frappe.log_error(
            frappe.get_traceback(),
            "has_proforma_invoice Failed",
        )
        raise

@frappe.whitelist()
def get_item_for_delivery_note(item_code, customer=None):
    if not item_code:
        frappe.throw("Missing Item Code.")

    try:
        filters = {"item_code": item_code}

        if customer:
            so_names = frappe.get_all(
                "Sales Order",
                filters={
                    "customer": customer,
                    "docstatus": 1,
                    "status": ["!=", "Closed"],
                },
                pluck="name",
            )

            if not so_names:
                return []

            filters["parent"] = ["in", so_names]

        else:
            submitted_orders = frappe.get_all(
                "Sales Order",
                filters={
                    "docstatus": 1,
                    "status": ["!=", "Closed"],
                },
                pluck="name",
            )

            if not submitted_orders:
                return []

            filters["parent"] = ["in", submitted_orders]

        sales_order_items = frappe.get_all(
            "Sales Order Item",
            filters=filters,
            fields=["*"],
            order_by="creation asc",
        )

        if not sales_order_items:
            return []

        order_map = {}

        for item in sales_order_items:
            pending_qty = float(item.qty or 0) - float(item.delivered_qty or 0)

            if pending_qty > 0.01:
                item.qty = pending_qty
                order_map.setdefault(item.parent, []).append(item)

        response = []

        for so_name, items in order_map.items():
            so_doc = frappe.get_doc("Sales Order", so_name)

            response.append({
                "name": so_doc.name,
                "transaction_date": so_doc.transaction_date,
                "customer": so_doc.customer,
                "po_no": so_doc.po_no,
                "qty": sum(float(i.qty or 0) for i in items),
                "items": items,
                "sales_order": so_doc.as_dict(),
            })

        return response

    except Exception:
        frappe.log_error(
            frappe.get_traceback(),
            "get_item_for_delivery_note Failed",
        )
        raise


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def get_valid_proforma_invoices(doctype, txt, searchfield, start, page_len, filters):
    customer = filters.get("customer")

    return frappe.db.sql(
        f"""
        SELECT
            pi.name,
            pi.customer,
            pi.transaction_date
        FROM `tabProforma Invoice` pi
        WHERE pi.docstatus = 1
          AND pi.customer = %(customer)s
          AND NOT EXISTS (
                SELECT 1
                FROM `tabSales Order Item` soi
                WHERE soi.proforma_invoice = pi.name
                  AND soi.docstatus != 2
          )
          AND pi.`{searchfield}` LIKE %(txt)s
        ORDER BY pi.creation DESC
        LIMIT %(start)s, %(page_len)s
        """,
        {
            "customer": customer,
            "txt": f"%{txt}%",
            "start": start,
            "page_len": page_len,
        },
    )
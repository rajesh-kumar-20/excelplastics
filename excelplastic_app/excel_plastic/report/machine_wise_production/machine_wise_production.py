import frappe
from datetime import datetime, timedelta
import calendar


def execute(filters=None):
    if not filters:
        filters = {}

    validate_filters(filters)

    # ✅ Get month date range
    from_date, to_date = get_month_date_range(filters)

    filters["from_date"] = from_date.strftime("%Y-%m-%d")
    filters["to_date"] = to_date.strftime("%Y-%m-%d")

    # ✅ Generate columns & periods
    columns, periods = get_columns(filters)

    # ✅ Fetch data
    data = get_data(filters, periods)

    return columns, data


# ✅ Validate Filters
def validate_filters(filters):
    if not filters.get("month") or not filters.get("year"):
        frappe.throw("Month and Year are required")


# ✅ Convert Month → Date Range
def get_month_date_range(filters):
    month = filters.get("month")
    year = int(filters.get("year"))

    month_number = list(calendar.month_name).index(month)

    from_date = datetime(year, month_number, 1)
    last_day = calendar.monthrange(year, month_number)[1]
    to_date = datetime(year, month_number, last_day)

    return from_date, to_date


# ✅ Generate Day-wise Columns
def get_columns(filters):
    from_date = datetime.strptime(filters["from_date"], "%Y-%m-%d")
    to_date = datetime.strptime(filters["to_date"], "%Y-%m-%d")

    columns = [
        {
            "label": "Machine ID",
            "fieldname": "workstation",
            "fieldtype": "Link",
            "options": "Workstation",
            "width": 150,
        },
        {
            "label": "Product",
            "fieldname": "item",
            "fieldtype": "Data",  # item_name → not Link
            "width": 180,
        },
    ]

    periods = []
    current = from_date

    while current <= to_date:
        fieldname = current.strftime("%Y_%m_%d")  # unique key
        label = current.strftime("%d")            # day display

        columns.append(
            {
                "label": label,
                "fieldname": fieldname,
                "fieldtype": "Float",
                "width": 80,
            }
        )

        periods.append(fieldname)
        current += timedelta(days=1)

    columns.append(
        {
            "label": "Total",
            "fieldname": "total",
            "fieldtype": "Float",
            "width": 120,
        }
    )

    return columns, periods


# ✅ Fetch & Pivot Data
def get_data(filters, periods):
    conditions = ""

    if filters.get("workstation"):
        conditions += " AND jc.workstation = %(workstation)s"

    if filters.get("item"):
        conditions += " AND wo.production_item = %(item)s"

    query = f"""
        SELECT
            DATE(jc.posting_date) as day,
            jc.workstation,
            jc.item_name as item,
            SUM(IFNULL(jc.for_quantity, 0)) as qty
        FROM `tabJob Card` jc
        LEFT JOIN `tabWork Order` wo ON wo.name = jc.work_order
        WHERE 
            jc.docstatus = 1
            AND jc.posting_date BETWEEN %(from_date)s AND %(to_date)s
            {conditions}
        GROUP BY day, jc.workstation, wo.production_item
    """

    raw = frappe.db.sql(query, filters, as_dict=True)

    data_map = {}

    for row in raw:
        key = (row["workstation"], row["item"])

        if key not in data_map:
            data_map[key] = {
                "workstation": row["workstation"],
                "item": row["item"],
                "total": 0,
            }

            # ✅ initialize all days as blank (NOT 0)
            for p in periods:
                data_map[key][p] = None

        day_key = row["day"].strftime("%Y_%m_%d")

        data_map[key][day_key] = row["qty"]
        data_map[key]["total"] += row["qty"]

    # ✅ Sort output
    return sorted(
        data_map.values(),
        key=lambda x: (x["workstation"] or "", x["item"] or ""),
    )
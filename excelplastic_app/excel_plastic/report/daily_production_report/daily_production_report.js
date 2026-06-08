// Copyright (c) 2026, Rajesh Kumar and contributors
// For license information, please see license.txt


frappe.query_reports["Daily Production Report"] = {
    "filters": [
        {
            "fieldname": "date",
            "label": "Date",
            "fieldtype": "Date",
            "default": frappe.datetime.get_today(),
            "reqd": 1
        }
    ]
};
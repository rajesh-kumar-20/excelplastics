// Copyright (c) 2026, Rajesh Kumar and contributors
// For license information, please see license.txt

frappe.query_reports["Machine Wise Production"] = {
	 "filters": [
        {
            fieldname: "workstation",
            label: "Machine ID",
            fieldtype: "Link",
            options: "Workstation"
        },
        {
            fieldname: "month",
            label: "Month",
            fieldtype: "Select",
            options: [
                "January","February","March","April","May","June",
                "July","August","September","October","November","December"
            ],
            default: frappe.datetime.str_to_obj(frappe.datetime.get_today()).toLocaleString('default', { month: 'long' }),
            reqd: 1
        },
{
    fieldname: "year",
    label: "Year",
    fieldtype: "Int",
    default: new Date().getFullYear(),
    reqd: 1
}
    ]
};

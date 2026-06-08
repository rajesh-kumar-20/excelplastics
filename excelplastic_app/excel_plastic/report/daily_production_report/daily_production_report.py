# Copyright (c) 2026, Rajesh Kumar and contributors
# For license information, please see license.txt

import frappe

def execute(filters=None):
    columns = get_columns()
    data = get_data(filters)   # ✅ PASS filters here
    return columns, data

def get_columns():
    return [
        {"label": "Machine", "fieldname": "machine", "fieldtype": "Link", "options": "Workstation", "width": 150},
        {"label": "Item Name", "fieldname": "item_name", "fieldtype": "Data", "width": 300},

        {"label": "Cavity", "fieldname": "cavity", "fieldtype": "Int", "width": 100},
        {"label": "Running Cavities", "fieldname": "running_cavities", "fieldtype": "Int", "width": 140},
        {"label": "Cycle Time (Sec)", "fieldname": "cycle_time", "fieldtype": "Float", "width": 120},
        {"label": "Material Grade", "fieldname": "material_grade", "fieldtype": "Data", "width": 150},
        {"label": "Color Grade", "fieldname": "color_grade", "fieldtype": "Data", "width": 150},
        {"label": "Weight", "fieldname": "weight", "fieldtype": "Float", "width": 100},
        {"label": "24 Hrs Qty", "fieldname": "qty_24hrs", "fieldtype": "Float", "width": 120},

        # 🔥 Production Split
        {"label": "Production (Day)", "fieldname": "prod_day", "fieldtype": "Float", "width": 150},
        {"label": "Production (Night)", "fieldname": "prod_night", "fieldtype": "Float", "width": 150},
        {"label": "Production (Total)", "fieldname": "prod_total", "fieldtype": "Float", "width": 150},

        # 🔥 Rejection Split
        {"label": "Rejection (Day)", "fieldname": "rej_day", "fieldtype": "Float", "width": 150},
        {"label": "Rejection (Night)", "fieldname": "rej_night", "fieldtype": "Float", "width": 150},
        {"label": "Rejection (Total)", "fieldname": "rej_total", "fieldtype": "Float", "width": 150},

        {"label": "Efficiency (%)", "fieldname": "efficiency", "fieldtype": "Percent", "width": 130},
        {"label": "Rejection Efficiency (%)", "fieldname": "rejection_efficiency", "fieldtype": "Percent", "width": 170},
		{"label": "Remarks", "fieldname": "remarks", "fieldtype": "Data", "width": 170},

    ]


def get_data(filters):
    return frappe.db.sql("""
        SELECT
            jc.workstation AS machine,
            jc.item_name,
            MAX(jc.custom_cavity) AS cavity,
            MAX(jc.custom_running_cavity) AS running_cavities,
			jc.custom_weight_per_unit AS weight,

            -- Material Grade
            (
                SELECT woi.item_name
                FROM `tabWork Order Item` woi
                WHERE woi.parent = jc.work_order
                AND woi.custom_is_material_grade = 1
                LIMIT 1
            ) AS material_grade,

            -- Color Grade
            (
                SELECT woi.item_name
                FROM `tabWork Order Item` woi
                WHERE woi.parent = jc.work_order
                AND woi.custom_is_color_grade = 1
                LIMIT 1
            ) AS color_grade,

            -- Cycle Time
            (
                SELECT bo.operation_time_sec
                FROM `tabBOM Operation` bo
                WHERE bo.parent = (
                    SELECT wo.bom_no
                    FROM `tabWork Order` wo
                    WHERE wo.name = jc.work_order
                    LIMIT 1
                )
                AND LOWER(bo.operation) = LOWER(jc.operation)
                LIMIT 1
            ) AS cycle_time,

            -- 🔥 24 Hrs Quantity (Rounded)
			ROUND(
				(86400 / NULLIF(
					(
						SELECT bo.operation_time_sec
						FROM `tabBOM Operation` bo
						WHERE bo.parent = (
							SELECT wo.bom_no
							FROM `tabWork Order` wo
							WHERE wo.name = jc.work_order
							LIMIT 1
						)
						AND LOWER(bo.operation) = LOWER(jc.operation)
						LIMIT 1
					), 0
				)) * MAX(jc.custom_running_cavity)
			, 0) AS qty_24hrs,

            -- Production
            COALESCE(SUM(CASE 
                WHEN LOWER(jctl.custom_shift_type) = 'day' THEN jctl.completed_qty 
                ELSE 0 
            END), 0) AS prod_day,

            COALESCE(SUM(CASE 
                WHEN LOWER(jctl.custom_shift_type) != 'day' THEN jctl.completed_qty 
                ELSE 0 
            END), 0) AS prod_night,

            COALESCE(SUM(jctl.completed_qty), 0) AS prod_total,

            -- Rejection
            COALESCE(SUM(CASE 
                WHEN LOWER(jctl.custom_shift_type) = 'day' THEN jctl.custom_rejection_qty 
                ELSE 0 
            END), 0) AS rej_day,

            COALESCE(SUM(CASE 
                WHEN LOWER(jctl.custom_shift_type) != 'day' THEN jctl.custom_rejection_qty 
                ELSE 0 
            END), 0) AS rej_night,

            COALESCE(SUM(jctl.custom_rejection_qty), 0) AS rej_total,

			-- 🔥 Remarks
			GROUP_CONCAT(
				DISTINCT NULLIF(jctl.custom_remarks, '') 
				SEPARATOR ', '
			) AS remarks,

            -- Efficiency
            (
                (COALESCE(SUM(jctl.completed_qty), 0) / NULLIF(
                    (
                        (86400 / NULLIF(
                            (
                                SELECT bo.operation_time_sec
                                FROM `tabBOM Operation` bo
                                WHERE bo.parent = (
                                    SELECT wo.bom_no
                                    FROM `tabWork Order` wo
                                    WHERE wo.name = jc.work_order
                                    LIMIT 1
                                )
                                AND LOWER(bo.operation) = LOWER(jc.operation)
                                LIMIT 1
                            ), 0
                        )) * MAX(jc.custom_running_cavity)
                    ), 0
                )) * 100
            ) AS efficiency,

            -- Rejection Efficiency
            (
                (COALESCE(SUM(jctl.custom_rejection_qty), 0) / NULLIF(
                    COALESCE(SUM(jctl.completed_qty), 0), 0
                )) * 100
            ) AS rejection_efficiency

        FROM `tabJob Card` jc

        INNER JOIN `tabJob Card Time Log` jctl
			ON jctl.parent = jc.name
			AND jctl.from_time >= %s
			AND jctl.from_time < DATE_ADD(%s, INTERVAL 1 DAY)

        WHERE jc.docstatus < 2

        GROUP BY 
            jc.workstation,
            jc.item_name

        ORDER BY jc.workstation, jc.item_name
    """, (filters.get("date"), filters.get("date")), as_dict=1)
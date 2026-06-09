// Copyright (c) 2026, Rajesh Kumar and contributors
// For license information, please see license.txt

frappe.ui.form.on('Mold Master', {
    refresh: function(frm) {
        console.log(frm);
        frm.set_query('process_name', function() {
            return {
                filters: {
                    custom_is_sub_operation: 0
                }
            };
        });
    },
  quality_inspection_template: function(frm) {
    const template_name = frm.doc.quality_inspection_template;

    frm.clear_table("item_quality_inspection_parameter");

    if (!template_name) {
      frm.refresh_field("item_quality_inspection_parameter");
      return;
    }
    frappe.model.with_doc("Quality Inspection Template", template_name).then(() => {
      const template = frappe.get_doc("Quality Inspection Template", template_name);
      const params = template.item_quality_inspection_parameter || [];

      params.forEach(param => {
        let row = frm.add_child("item_quality_inspection_parameter");

        for (let key in param) {
          if (!["name", "parent", "parenttype", "parentfield", "idx", "doctype"].includes(key)) {
            let val = param[key];
            if (val && String(val).trim() !== "") {
              row[key] = val;
            }
          }
        }
      });

      frm.refresh_field("item_quality_inspection_parameter");

      if (frm.doc.item_quality_inspection_parameter.length === 0) {
        frappe.msgprint("No filled parameters found in the selected Template.");
      }
    });
  },

  validate(frm) {
    let invalid = false;

    // Ensure the table exists
    const params = frm.doc.item_quality_inspection_parameter || [];

    params.forEach((row) => {
      const is_row_filled = row.specification || row.value || row.min_value || row.max_value || row.formula;
      if (!is_row_filled) return; // Skip completely empty rows

      const label = ` ${row.specification || "Unnamed"}`;
      const is_numeric = row.numeric == 1 || row.numeric === true || row.numeric === "1";
      const is_formula = row.formula_based_criteria == 1 || row.formula_based_criteria === true || row.formula_based_criteria === "1";

      if (is_numeric) {
        const min_valid = !!row.min_value && Number(row.min_value) !== 0;
        const max_valid = !!row.max_value && Number(row.max_value) !== 0;
        if (!min_valid || !max_valid) {
          frappe.msgprint(`${label}: "Numeric" selected, Mandatory field Min & Max.`);
          invalid = true;
        }
      } else if (is_formula) {
        if (!row.formula || row.formula.trim() === "") {
          frappe.msgprint(`${label}: "Formula Based Criteria" selected, Enter the formula.`);
          invalid = true;
        }
      } else {
        if (!row.value || row.value.trim() === "") {
          frappe.msgprint(`${label}: Enter an Acceptance Criteria Value or select Numeric/Formula.`);
          invalid = true;
        }
      }
    });

    if (invalid) {
      frappe.validated = false;
    }
  }
});


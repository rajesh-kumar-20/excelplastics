frappe.ui.form.on('Quality Inspection', {

    reference_type: function(frm) {
        frm.set_value("reference_name", "");
        frm.set_value("custom_workstation", "");
        frm.set_value("item_code", "");
    },
    reference_name: function(frm) {
        if (frm.doc.reference_type === "Job Card" && frm.doc.reference_name) {

            // Step 1: Get Job Card
            frappe.db.get_doc("Job Card", frm.doc.reference_name)
                .then(job => {
                    // ✅ Fetch Workstation
                    if (job.workstation) {
                        frm.set_value("custom_workstation", job.workstation);
                    }
                    // Step 2: Fetch Item Code from Work Order
                    if (job.work_order) {
                        frappe.db.get_value(
                            "Work Order",
                            job.work_order,
                            "production_item",
                            function(r) {
                                if (r.production_item) {
                                    frm.set_value("item_code", r.production_item);
                                }
                            }
                        );
                    }
                });
        }
    }
});

// frappe.ui.form.on('Quality Inspection', {
//     custom_running_cavity(frm) {
//         if (!frm.doc.custom_running_cavity) {
//             frm.set_value('sample_size', 0);
//             return;
//         }

//         let cavity = flt(frm.doc.custom_running_cavity);
//         frm.set_value('sample_size', cavity * 3);
//     }
// });
frappe.ui.form.on('Quality Inspection', {
    custom_workstation: function (frm) {
        calculate_sample_size(frm);
    },
    custom_running_cavity: function (frm) {
        calculate_sample_size(frm);
    }
});

function calculate_sample_size(frm) {
    if (!frm.doc.custom_workstation || !frm.doc.custom_running_cavity) {
        return;
    }

    frappe.db.get_value(
        'Workstation',
        frm.doc.custom_workstation,
        'custom_sample_qty'
    ).then(r => {
        if (r && r.message && r.message.custom_sample_qty) {
            let sample_qty = flt(r.message.custom_sample_qty);
            let running_cavity = flt(frm.doc.custom_running_cavity);

            let total_sample_size = sample_qty * running_cavity;

            frm.set_value('sample_size', total_sample_size);
        }
    });
}

// -------------------------------
// Parent → Rows (Select All)
// -------------------------------
frappe.ui.form.on('Quality Inspection', {
    custom_visual_check(frm) {

        // 🛑 HARD STOP: do nothing if change came from child sync
        if (frm.__updating_from_child) {
            return;
        }

        let value = frm.doc.custom_visual_check ? 1 : 0;

        (frm.doc.readings || []).forEach(row => {
            let is_numeric =
                row.numeric ||
                row.formula_based_criteria;

            if (is_numeric) return;

            row.custom_visual = value;
            row.manual_inspection = 1;
            row.status = value ? 'Accepted' : 'Rejected';
        });

        frm.refresh_field('readings');
    }
});


// -------------------------------
// Row → Parent (sync checkbox)
// -------------------------------
frappe.ui.form.on('Quality Inspection Reading', {
    custom_visual(frm, cdt, cdn) {

        let row = locals[cdt][cdn];

        let is_numeric =
            row.numeric ||
            row.formula_based_criteria;

        if (!is_numeric) {
            row.manual_inspection = 1;
            row.status = row.custom_visual ? 'Accepted' : 'Rejected';
        }

        // 🔁 Calculate if ALL visual rows are checked
        let all_checked = true;

        (frm.doc.readings || []).forEach(r => {
            let r_is_numeric =
                r.numeric ||
                r.formula_based_criteria;

            if (r_is_numeric) return;

            if (!r.custom_visual) {
                all_checked = false;
            }
        });

        // 🛑 BLOCK parent handler BEFORE setting value
        frm.__updating_from_child = true;
        frm.doc.custom_visual_check = all_checked ? 1 : 0;
        frm.refresh_field('custom_visual_check');
        frm.__updating_from_child = false;
    }
});





// frappe.ui.form.on("Quality Inspection", {
//     item_code(frm) {
//         if (!frm.doc.item_code) return;

//         frappe.call({
//             method: "frappe.client.get",
//             args: {
//                 doctype: "Item",
//                 name: frm.doc.item_code
//             },
//             callback: function (res) {
//                 let item = res.message;
//                 if (item && item.item_quality_inspection_parameter) {
//                     let params = item.item_quality_inspection_parameter;

//                     frm.clear_table("readings");

//                     params.forEach(param => {
//                         frm.add_child("readings", {
//                             specification: param.specification,
//                             acceptable_criteria: param.acceptable_criteria,
//                             min_value:param.min_value,
//                             max_value:param.max_value,
//                             value: param.value || "",
//                             formula_based_criteria:param.formula_based_criteria,
//                             acceptance_formula:param.acceptance_formula,
//                             numeric:param.numeric
                            
//                         });
//                     });

//                     frm.refresh_field("readings");
//                 }
//             }
//         });
//     }
// });




// frappe.ui.form.on("Quality Inspection", {
//     refresh(frm) {
//         console.log("refresh:", frm.doc.item_code);
//         if (frm.doc.item_code) {
//             setTimeout(() => populate_readings_from_item(frm), 300);
//         }
//     }
// });
// function populate_readings_from_item(frm) {
//     if (!frm.doc.item_code) {
//         console.log("No item_code found");
//         return;
//     }

//     frappe.call({
//         method: "frappe.client.get",
//         args: {
//             doctype: "Item",
//             name: frm.doc.item_code
//         },
//         callback: function (res) {
//             let item = res.message;
//             console.log(" Got item:", item);

//             if (item && Array.isArray(item.item_quality_inspection_parameter)) {
//                 frm.clear_table("readings");

//                 item.item_quality_inspection_parameter.forEach(param => {
//                     console.log("Adding param:", param.specification);
//                     frm.add_child("readings", {
//                         specification: param.specification,
//                         acceptable_criteria: param.acceptable_criteria,
//                         min_value: param.min_value,
//                         max_value: param.max_value,
//                         value: param.value || "",
//                         formula_based_criteria: param.formula_based_criteria,
//                         acceptance_formula: param.acceptance_formula,
//                         numeric: param.numeric
//                     });
//                 });

//                 frm.refresh_field("readings");
//                 console.log("Done: readings table updated");
//             } 
//         }
//     });
// }




frappe.ui.form.on("Quality Inspection", {
    refresh(frm) {
        console.log("refresh:", frm.doc.item_code);

        // Auto-populate only if readings are empty
        if (frm.doc.item_code && frm.doc.readings.length === 0) {
            setTimeout(() => populate_readings_from_item(frm), 300);
        }

        // Manual button to reload readings without confirmation
        frm.add_custom_button("Get Specification", () => {
            populate_readings_from_item(frm);
        });
    }
});

function populate_readings_from_item(frm) {
    if (!frm.doc.item_code) {
        console.log("No item_code found");
        return;
    }

    frappe.call({
        method: "frappe.client.get",
        args: {
            doctype: "Item",
            name: frm.doc.item_code
        },
        callback: function (res) {
            let item = res.message;
            console.log("Got item:", item);

            if (item && Array.isArray(item.item_quality_inspection_parameter)) {
                frm.clear_table("readings");

                item.item_quality_inspection_parameter.forEach(param => {
                    console.log("Adding param:", param.specification);
                    frm.add_child("readings", {
                        specification: param.specification,
                        acceptable_criteria: param.acceptable_criteria,
                        min_value: param.min_value,
                        max_value: param.max_value,
                        value: param.value || "",
                        formula_based_criteria: param.formula_based_criteria,
                        acceptance_formula: param.acceptance_formula,
                        numeric: param.numeric
                    });
                });

                frm.refresh_field("readings");
                console.log("Done: readings table updated");
            }
        }
    });
}


// frappe.ui.form.on("Quality Inspection", {
//   refresh(frm) {
//     console.log("refresh:", frm.doc.item_code);

//     if (frm.doc.item_code && frm.doc.readings.length === 0) {
//       populate_readings_from_item(frm);
//     }
//   },

//   item_code(frm) {
//     console.log("item_code changed:", frm.doc.item_code);

//     if (frm.doc.item_code && frm.doc.readings.length === 0) {
//       populate_readings_from_item(frm);
//     }
//   }
// });

// function populate_readings_from_item(frm) {
//   console.log(">> Running populate_readings_from_item for", frm.doc.item_code);

//   frappe.model.with_doc("Item", frm.doc.item_code, function () {
//     let item_doc = frappe.model.get_doc("Item", frm.doc.item_code);
//     console.log("Got full Item doc:", item_doc);

//     if (item_doc.item_quality_inspection_parameter?.length) {
//       frm.clear_table("readings");

//       item_doc.item_quality_inspection_parameter.forEach(param => {
//         console.log("Adding param:", param.specification);

//         frm.add_child("readings", {
//           specification: param.specification,
//           acceptable_criteria: param.acceptable_criteria,
//           min_value: param.min_value,
//           max_value: param.max_value,
//           value: param.value || "",
//           formula_based_criteria: param.formula_based_criteria,
//           acceptance_formula: param.acceptance_formula,
//           numeric: param.numeric
//         });
//       });

//       frm.refresh_field("readings");
//       console.log("✔️ Readings table updated");
//     } else {
//       console.warn("No quality parameters found on item");
//     }
//   });
// }

frappe.ui.form.on('Item', {
  refresh: function(frm) {
    frm.set_query('custom_mold_id', function() {
      return {
        filters: {
          quality_inspection_template: ["!=", ""],
        
        }
      };
    });
  }
});

frappe.ui.form.on('Item', {
    onload: function(frm) {

        frm.set_query('quality_inspection_template', function() {
            return {
                filters: {
                    quality_inspection_template_name: frm.doc.name
                }
            };
        });

        frm.fields_dict.quality_inspection_template.new_doc = function() {

            frappe.route_options = {
                quality_inspection_template_name: frm.doc.name
            };

            frappe.new_doc('Quality Inspection Template');
        };
    }
});


frappe.ui.form.on('Item', {
  quality_inspection_template(frm) {
    if (!frm.doc.quality_inspection_template) {
      // If the template is cleared, also clear the child table
      frm.clear_table("item_quality_inspection_parameter");
      frm.refresh_field("item_quality_inspection_parameter");
      return;
    }

    frappe.model.with_doc("Quality Inspection Template", frm.doc.quality_inspection_template, () => {
      const tmpl = frappe.get_doc("Quality Inspection Template", frm.doc.quality_inspection_template);

      if (tmpl.item_quality_inspection_parameter && tmpl.item_quality_inspection_parameter.length > 0) {
        frm.clear_table("item_quality_inspection_parameter");

        tmpl.item_quality_inspection_parameter.forEach(t => {
          const row = frm.add_child("item_quality_inspection_parameter");
          Object.keys(t).forEach(key => {
            if (!["name", "parent", "parenttype", "parentfield"].includes(key)) {
              row[key] = t[key];
            }
          });
        });

        frm.refresh_field("item_quality_inspection_parameter");
      }
    });
  }
});



frappe.ui.form.on('Item', {
    custom_mold_id: function(frm) {
        const selected_molds = frm.doc.custom_mold_id;
        if (!selected_molds || selected_molds.length === 0) return;

        // Collect existing customer codes (IDs) in child table
        const existing_customers = new Set(
            (frm.doc.customer_items || []).map(row => row.customer_name)
        );

        const customerPromises = selected_molds.map(mold_row => {
            return frappe.db.get_value('Mold Master', mold_row.mold_id, 'customer_id');
        });

        Promise.all(customerPromises).then(responses => {
            const unique_customer_ids = new Set();

            responses.forEach(res => {
                if (res && res.message && res.message.customer_id) {
                    unique_customer_ids.add(res.message.customer_id);
                }
            });

            const nameFetches = Array.from(unique_customer_ids).map(cust_id => {
                return frappe.db.get_value('Customer', cust_id, ['name', 'customer_name']).then(res => ({
                    customer_id: res.message.name,           // CUS001
                    customer_name: res.message.customer_name // Excel
                }));
            });

            Promise.all(nameFetches).then(final_customers => {
                final_customers.forEach(cust => {
                    // Only add if not already present (check against Customer Code)
                    if (!existing_customers.has(cust.customer_id)) {
                        const row = frm.add_child('customer_items');
                        row.customer_name = cust.customer_id;     // Code (CUS001)
                        row.ref_code = "";
                        row.custom_customer = cust.customer_name; // Name (Excel)

                        existing_customers.add(cust.customer_id); // update set
                    }
                });

                frm.refresh_field('customer_items');
            });
        });
    }
});








// Utility function to populate parameters in Item
function populate_qi_parameters(frm, source_parameters) {
  source_parameters.forEach(param => {
    const row = frm.add_child("item_quality_inspection_parameter");
    
    // Replace/add keys here based on your actual child table fields
    
    row.specification = param.specification;
    row.numeric = param.numeric;
    row.value = param.value;
    row.min_value = param.min_value;
    row.max_value = param.max_value;
    row.custom_uom = param.custom_uom;
    row.formula_based_criteria=param.formula_based_criteria;
    row.acceptance_formula=param.acceptance_formula;
  });

  frm.refresh_field("item_quality_inspection_parameter");
}

// Main trigger on Table MultiSelect field
frappe.ui.form.on('Item', {
  custom_mold_id: function(frm) {
    const mold_links = frm.doc.custom_mold_id || [];

    if (!mold_links.length) {
      frm.set_value('quality_inspection_template', null);
      frm.clear_table("item_quality_inspection_parameter");
      frm.refresh_fields(["quality_inspection_template", "item_quality_inspection_parameter"]);
      return;
    }

    frm.clear_table("item_quality_inspection_parameter");

    // Collect promises for each selected Mold Master
    const moldPromises = mold_links.map(row => frappe.db.get_doc("Mold Master", row.mold_id));

    Promise.all(moldPromises).then(mold_docs => {
      const templates = new Set();
      let merged_parameters = [];

      mold_docs.forEach(doc => {
        if (doc.quality_inspection_template) {
          templates.add(doc.quality_inspection_template);
        }

        if (doc.item_quality_inspection_parameter?.length) {
          merged_parameters = merged_parameters.concat(doc.item_quality_inspection_parameter);
        }
      });

      // Set template if only one found
      if (templates.size === 1) {
        frm.set_value('quality_inspection_template', Array.from(templates)[0]);
      } else {
        frm.set_value('quality_inspection_template', null);
        if (templates.size > 1) {
          frappe.msgprint("Multiple Quality Inspection Templates found.");
        }
      }

      // Finally populate parameter rows
      populate_qi_parameters(frm, merged_parameters);
    });
  }
});


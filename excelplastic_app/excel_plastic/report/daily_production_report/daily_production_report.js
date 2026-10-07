// Copyright (c) 2026, Rajesh Kumar and contributors
// For license information, please see license.txt

frappe.query_reports["Daily Production Report"] = {

    filters: [
        {
            fieldname: "date",
            label: "Date",
            fieldtype: "Date",
            default: frappe.datetime.get_today(),
            reqd: 1
        }
    ],

    onload: function (report) {
        setup_frozen_machine_column(report);
    },

    refresh: function (report) {
        setTimeout(() => {
            setup_frozen_machine_column(report);
        }, 500);
    }
};

function setup_frozen_machine_column(report) {

    setTimeout(() => {

        const wrapper = report.page.wrapper;
        const scrollable = wrapper.find(".dt-scrollable");

        if (!scrollable.length) {
            console.log("DataTable scroll container not found");
            return;
        }

        scrollable.off("scroll.freeze_machine");

        // Get widths of the first two columns
        const serialCell = wrapper
            .find(".dt-scrollable .dt-cell--col-0")
            .first();

        const machineCell = wrapper
            .find(".dt-scrollable .dt-cell--col-1")
            .first();

        if (!serialCell.length || !machineCell.length) {
            console.log("Frozen columns not found");
            return;
        }

        const serialWidth = serialCell.outerWidth();
        const machineWidth = machineCell.outerWidth();

        // ==========================================
        // Freeze body columns
        // S.No. + Machine + Item Name
        // ==========================================

        function freeze_body_columns() {

            // S.No.
            wrapper
                .find(".dt-scrollable .dt-cell--col-0")
                .css({
                    position: "sticky",
                    left: "0px",
                    zIndex: "30",
                    backgroundColor: "#ffffff"
                });

            // Machine
            wrapper
                .find(".dt-scrollable .dt-cell--col-1")
                .css({
                    position: "sticky",
                    left: serialWidth + "px",
                    zIndex: "29",
                    backgroundColor: "#ffffff"
                });

            // Item Name
            wrapper
                .find(".dt-scrollable .dt-cell--col-2")
                .css({
                    position: "sticky",
                    left: (serialWidth + machineWidth) + "px",
                    zIndex: "28",
                    backgroundColor: "#ffffff",
                    boxShadow: "3px 0 5px rgba(0,0,0,0.12)"
                });
        }

        // ==========================================
        // Freeze header titles
        // ==========================================

        function position_header_titles(scrollLeft) {

            const headerSerial =
                wrapper.find(".dt-header .dt-cell--col-0");

            const headerMachine =
                wrapper.find(".dt-header .dt-cell--col-1");

            const headerItem =
                wrapper.find(".dt-header .dt-cell--col-2");

            headerSerial.css({
                position: "relative",
                transform: "translateX(" + scrollLeft + "px)",
                zIndex: "50",
                backgroundColor: "#f8f8f8"
            });

            headerMachine.css({
                position: "relative",
                transform: "translateX(" + scrollLeft + "px)",
                zIndex: "49",
                backgroundColor: "#f8f8f8"
            });

            headerItem.css({
                position: "relative",
                transform: "translateX(" + scrollLeft + "px)",
                zIndex: "48",
                backgroundColor: "#f8f8f8",
                boxShadow: "3px 0 5px rgba(0,0,0,0.12)"
            });
        }

        // Initial positioning
        freeze_body_columns();
        position_header_titles(scrollable.scrollLeft());

        // Re-apply while scrolling
        scrollable.on("scroll.freeze_machine", function () {

            const scrollLeft = this.scrollLeft;

            requestAnimationFrame(() => {
                freeze_body_columns();
                position_header_titles(scrollLeft);
            });
        });

    }, 1000);
}
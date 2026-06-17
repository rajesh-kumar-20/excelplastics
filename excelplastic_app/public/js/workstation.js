// ==========================================================
// WORKSTATION CLIENT SCRIPT
// PURPOSE:
// Hide ALL native "Complete" + "Start Job" buttons
// from Workstation Job Card list
//
// COPY-PASTE:
// Client Script
// DocType: Workstation
// ==========================================================

frappe.ui.form.on("Workstation", {
    refresh(frm) {

        // Prevent duplicate install
        if (frm.__hide_buttons_installed) return;
        frm.__hide_buttons_installed = true;

        function hide_buttons() {

            // --------------------------------------------------
            // HIDE COMPLETE BUTTONS
            // --------------------------------------------------
            frm.page.wrapper.find(
                'button[data-label="Complete"], button[data-label="Complete Job"], button[data-label="Complete%20Job"]'
            ).hide();

            // --------------------------------------------------
            // HIDE START JOB BUTTONS
            // --------------------------------------------------
            frm.page.wrapper.find(
                'button[data-label="Start Job"], button[data-label="Start%20Job"]'
            ).hide();

            // --------------------------------------------------
            // HIDE BY VISIBLE TEXT (Fallback)
            // --------------------------------------------------
            frm.page.wrapper.find("button").filter(function () {

                const txt = $(this)
                    .text()
                    .trim()
                    .replace(/\s+/g, " ");

                return (
                    txt === "Complete" ||
                    txt === "Complete Job" ||
                    txt === "Start Job" ||
                    txt === "Start"
                );
            }).hide();
        }

        // --------------------------------------------------
        // INITIAL HIDE AFTER RENDER
        // --------------------------------------------------
        setTimeout(() => {
            hide_buttons();
        }, 800);

        // --------------------------------------------------
        // KEEP HIDING ON DYNAMIC RELOADS
        // --------------------------------------------------
        const observer = new MutationObserver(() => {
            hide_buttons();
        });

        if (frm.page.wrapper[0]) {
            observer.observe(frm.page.wrapper[0], {
                childList: true,
                subtree: true
            });
        }

        frm.__button_observer = observer;
    },

    // --------------------------------------------------
    // CLEANUP
    // --------------------------------------------------
    on_unload(frm) {
        if (frm.__button_observer) {
            frm.__button_observer.disconnect();
        }
    }
});
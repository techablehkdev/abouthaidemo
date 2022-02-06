$(function () {
    "use strict";
    var current_client_url = "";

    function reload_facing_screen() {
        window.addEventListener("storage", function (event) {
            if (event.key === 'facing_screen' && event.newValue) {
                var trimmed = $.trim(event.newValue);
                var $parsedHTML = $('<div>').html($.parseHTML(trimmed, true)); // WARNING: the true here will executes any script present in the string to parse
                var new_client_url = $parsedHTML.find(".resources > base").attr('href');

                current_client_url = new_client_url;
                $("body").removeClass('original_body').addClass('ajax_got_body');
                $("head").children().not('.origin').remove();
                $("head").append($parsedHTML.find(".resources").html());
                $("body").html(trimmed);

                $(".container").html($parsedHTML.find('.pos-customer_facing_display').html());
                $(".container").attr('class', 'container').addClass($parsedHTML.find('.pos-customer_facing_display').attr('class'));

                var d = $('.pos_orderlines_list');
                d.scrollTop(d.prop("scrollHeight"));

                if (typeof foreign_js !== 'undefined' && $.isFunction(foreign_js)) {
                    foreign_js();
                }
            }

        }, false);
    }

    reload_facing_screen();
});
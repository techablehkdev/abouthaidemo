odoo.define('pos_retail.ButtonWiseReceipt', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');
    const core = require('web.core');
    const qweb = core.qweb;
    const OrderReceipt = require('point_of_sale.OrderReceipt');

    class ButtonWiseReceipt extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
        }

        get isHighlighted() {
            return this.env.pos.config.category_wise_receipt
        }

        get wiseReceipt() {
            if (this.env.pos.config.category_wise_receipt) {
                return this.env._t('Wise Receipt Category On')
            } else {
                return this.env._t('Wise Receipt Category Off')
            }

        }

        async onClick() {
            let isOff = 'Off'
            let isOn = 'On'
            if (!this.env.pos.config.category_wise_receipt) {
                isOn = 'Off'
                isOff = 'On'
            }
            const order = this.env.pos.get_order();
            this.env.pos.config.category_wise_receipt = !this.env.pos.config.category_wise_receipt
            this.render()
            const orderRequest = null
            const fixture = document.createElement('div');
            const orderReceipt = new (Registries.Component.get(OrderReceipt))(null, {order, orderRequest});
            await orderReceipt.mount(fixture);
            const receiptHtml = orderReceipt.el.outerHTML;
            this.showScreen('ReportScreen', {
                report_html: receiptHtml,
                report_xml: null,
            });
        }
    }

    ButtonWiseReceipt.template = 'ButtonWiseReceipt';

    ProductScreen.addControlButton({
        component: ButtonWiseReceipt,
        condition: function () {
            return this.env.pos.config.review_receipt_before_paid;
        },
    });

    Registries.Component.add(ButtonWiseReceipt);

    return ButtonWiseReceipt;
});

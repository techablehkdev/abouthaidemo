odoo.define('pos_retail.ButtonProvideCreditToCustomer', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');
    const {posbus} = require('point_of_sale.utils');

    class ButtonProvideCreditToCustomer extends PosComponent {

        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
        }

        async onClick() {
            const creditOrder = this.env.pos.get_order()
            if (!creditOrder.get_client()) {
                let {confirmed, payload: newClient} = await this.showTempScreen(
                    'ClientListScreen',
                    {
                        client: null,
                        body: this.env._t('Required Customer for Provide Credit')
                    }
                );
                if (confirmed) {
                    creditOrder.set_client(newClient);
                } else {
                    return false
                }
            }
            const client = creditOrder.get_client()
            let {confirmed, payload: number} = await this.showPopup('NumberPopup', {
                title: this.env._t('How much Credit Amount set to Customer'),
                body: this.env._t('Please input Credit Amount will give to Customer'),
            });
            if (confirmed) {
                let {confirmed} = await this.showPopup('ConfirmPopup', {
                    title: this.env._t('Please Confirm'),
                    body: this.env._t('Are you sure give ') + client.name + this.env._t(' with Credit Amount: ') + this.env.pos.format_currency(number),
                })
                if (confirmed) {
                    let creditProduct = this.env.pos.db.product_by_id[this.env.pos.config.credit_product_id[0]]
                    creditProduct['taxes_id'] = []
                    if (!creditProduct) {
                        this.env.pos.alert_message({
                            title: this.env._t('Warning'),
                            body: this.env.pos.config.credit_product_id[1] + this.env._t(' not found in your pos !')
                        })
                        return false
                    }
                    creditOrder.add_product(creditProduct, {
                        quantity: 1,
                        price: parseFloat(number),
                    })
                    posbus.trigger('set-screen', 'Payment')
                }
            }
        }
    }

    ButtonProvideCreditToCustomer.template = 'ButtonProvideCreditToCustomer';

    ProductScreen.addControlButton({
        component: ButtonProvideCreditToCustomer,
        condition: function () {
            return this.env.pos.config.credit && this.env.pos.config.credit_product_id;
        },
    });

    Registries.Component.add(ButtonProvideCreditToCustomer);

    return ButtonProvideCreditToCustomer;
});

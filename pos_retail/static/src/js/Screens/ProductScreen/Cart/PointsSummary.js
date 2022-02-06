odoo.define('pos_retail.PointsSummary', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const utils = require('web.utils');

    class PointsSummary extends PosComponent {
        get get_points() {
            return this.env.pos.get_order().get_client_points()
        }

        get order() {
            const order = this.env.pos.get_order()
            return order;
        }

        async _setLoyaltyReward() {
            const order = this.env.pos.get_order()
            let client = order.get_client();
            if (!this.env.pos.rewards || client['pos_loyalty_point'] <= 0) {
                return this.showPopup('ErrorPopup', {
                    title: this.env._t('Warning'),
                    body: this.env._t('Customer not set or have not any Reward available in your POS')
                })
            }
            let {confirmed, payload: confirm} = await this.showPopup('ConfirmPopup', {
                title: client.name,
                body: this.env._t('Have total points: ') + this.env.pos.format_currency_no_symbol(client['pos_loyalty_point']),
                confirmText: this.env._t('Use Points now'),
                cancelText: this.env._t('Close')
            })
            if (confirmed) {
                const list = this.env.pos.rewards.map(reward => ({
                    id: reward.id,
                    label: reward.name,
                    isSelected: false,
                    item: reward
                }))
                let {confirmed, payload: reward} = await this.showPopup('SelectionPopup', {
                    title: this.env._t('Please select one Reward need apply to customer'),
                    list: list,
                });
                if (confirmed) {
                    order.setRewardProgram(reward)
                }
            }
        }
    }

    PointsSummary.template = 'PointsSummary';

    Registries.Component.add(PointsSummary);

    return PointsSummary;
});

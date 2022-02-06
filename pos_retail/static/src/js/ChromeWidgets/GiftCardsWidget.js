odoo.define('pos_retail.GiftCardsWidget', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const {posbus} = require('point_of_sale.utils');

    class GiftCardsWidget extends PosComponent {
        async onClick() {
            let reload_models = _.filter(this.env.pos.models, function (model) {
                return model.model == 'gift.card';
            });
            if (reload_models.length > 0) {
                await this.env.pos.load_server_data_by_model(reload_models[0]);
            }
            if (this.env.pos.get_order()) {
                const client = this.env.pos.get_order().get_client()
                if (client) {
                    this.env.pos.alert_message({
                        title: this.env._t('All Card of Customer'),
                        body: client.display_name
                    })
                } else {
                    this.env.pos.alert_message({
                        title: this.env._t('All Card'),
                        body: this.env._t('of System'),
                    })
                }
                const {confirmed, payload: nul} = await this.showTempScreen(
                    'GiftCardScreen',
                    {
                        card: null,
                        selectedClient: client
                    }
                );
            } else {
                const {confirmed, payload: nul} = await this.showTempScreen(
                    'GiftCardScreen',
                    {
                        card: null,
                        selectedClient: null
                    }
                );
            }
        }

        get isHidden() {
            if (!this.env || !this.env.pos || !this.env.pos.config || (this.env && this.env.pos && this.env.pos.config && !this.env.pos.config.gift_card_screen)) {
                return true
            } else {
                return false
            }
        }

        get count() {
            return this.env.pos && this.env.pos.db.cards_stored.length
        }
    }

    GiftCardsWidget.template = 'GiftCardsWidget';

    Registries.Component.add(GiftCardsWidget);

    return GiftCardsWidget;
});

odoo.define('pos_retail.GiftCardDetail', function (require) {
    'use strict';

    const {getDataURLFromFile} = require('web.utils');
    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const {useListener} = require('web.custom_hooks');
    const models = require('point_of_sale.models');
    const core = require('web.core');
    const qweb = core.qweb;
    const {posbus} = require('point_of_sale.utils');
    const field_utils = require('web.field_utils');
    const {useState, useRef, useContext} = owl.hooks;

    class GiftCardDetail extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('actionPrint', () => this.actionPrint());
            useListener('addGiftToOrder', () => this.addGiftToOrder());
            useListener('saveChange', () => this.saveChange());
            this.changes = {
                change: false,
                fieldsChange: {}
            };
            this.state = useState(this.changes);
        }

        mounted() {
            super.mounted()
            this.getRedeemSaleLines()
            this.getRedeemPosLines()
        }

        async addGiftToOrder() {
            const card = await this.getGiftCard()
            let giftProduct = this.env.pos.db.product_by_id[this.env.pos.config.gift_card_product_id[0]]
            if (card.balance > 0) {
                const currentOrder = this.env.pos.get_order();
                const totalPaid = currentOrder.get_total_with_tax()
                if (totalPaid <= 0) {
                    return this.showPopup('ErrorPopup', {
                        title: this.env._t('Error'),
                        body: this.env._t('Please add items to card and Amount of Order required bigger than 0')
                    })
                }
                for (let line of currentOrder.orderlines.models) {
                    if (line.product.id === giftProduct.id && line.price < 0) {
                        currentOrder.remove_orderline(line)
                    }
                }
                for (let line of currentOrder.orderlines.models) {
                    if (line.product.id === giftProduct.id && line.price < 0) {
                        currentOrder.remove_orderline(line)
                    }
                }
                for (let line of currentOrder.orderlines.models) {
                    if (line.product.id === giftProduct.id && line.price < 0) {
                        currentOrder.remove_orderline(line)
                    }
                }
                let giftAmountApply = 0
                if (card.balance <= totalPaid) {
                    giftAmountApply = card.balance
                } else {
                    giftAmountApply = totalPaid
                }
                await currentOrder.add_product(giftProduct, {
                    price: giftAmountApply,
                    quantity: 1,
                    merge: false,
                    gift_card_id: this.props.card.id,
                });
                this.trigger('close-temp-screen');
            }
        }

        OnChange(event) {
            this.state.change = true
            if (event.target.type == 'checkbox') {
                this.changes.fieldsChange[event.target.name] = event.target.checked;
            } else {
                this.changes.fieldsChange[event.target.name] = event.target.value;
            }
        }

        async getRedeemSaleLines() {
            let saleLineObj = this.env.pos.get_model('sale.order.line');
            let redeemSaleLines = await this.rpc({
                model: saleLineObj.model,
                method: 'search_read',
                domain: [['gift_card_id', '=', this.props.card.id]],
                fields: ['create_date', 'order_id', 'price_total']
            })
            if (redeemSaleLines) {
                redeemSaleLines.forEach(l => {
                    let create_date = field_utils.parse.datetime(l.create_date);
                    l.create_date = field_utils.format.datetime(create_date);
                })
                this.props.card['redeemSaleLines'] = redeemSaleLines
            } else {
                this.props.card['redeemSaleLines'] = []
            }
            this.render()
        }

        async getRedeemPosLines() {
            let posLineObj = this.env.pos.get_model('pos.order.line');
            let redeemPosLines = await this.rpc({
                model: posLineObj.model,
                method: 'search_read',
                domain: [['gift_card_id', '=', this.props.card.id]],
                fields: ['create_date', 'order_id', 'price_subtotal_incl']
            }, {
                shadow: true,
                timeout: 75000
            })
            if (redeemPosLines) {
                redeemPosLines.forEach(l => {
                    let create_date = field_utils.parse.datetime(l.create_date);
                    l.create_date = field_utils.format.datetime(create_date);
                })
                this.props.card['redeemPosLines'] = redeemPosLines
            } else {
                this.props.card['redeemPosLines'] = []
            }
            this.render()
        }

        async actionPrint() {
            await this.env.pos.do_action('pos_gift_card.gift_card_report_pdf', {
                additional_context: {
                    active_ids: [this.props.card.id]
                }
            })
        }

        async getGiftCard() {
            let giftCardObj = this.env.pos.get_model('gift.card');
            let cards = await this.rpc({
                model: giftCardObj.model,
                method: 'search_read',
                domain: [['id', '=', this.props.card.id]],
                fields: giftCardObj.fields,
            })
            if (cards.length == 1) {
                return cards[0]
            } else {
                return false
            }
        }

        async saveChange() {
            const changes = this.changes.fieldsChange
            let giftCardObj = this.env.pos.get_model('gift.card');
            let updateCard = await this.rpc({
                model: giftCardObj.model,
                method: 'write',
                args: [[this.props.card.id], changes],
            })
            const card = await this.getGiftCard()
            if (card) {
                this.props.card = card
                this.changes.change = false
                await this.getRedeemSaleLines()
                await this.getRedeemPosLines()
            }
        }

        get partnerImageUrl() {
            const card = this.props.card;
            const partner_id = card.partner_id
            if (partner_id) {
                return `/web/image?model=res.partner&id=${partner_id[0]}&field=image_128&unique=1`;
            } else {
                return false;
            }
        }
    }

    GiftCardDetail.template = 'GiftCardDetail';

    Registries.Component.add(GiftCardDetail);

    return GiftCardDetail;
});

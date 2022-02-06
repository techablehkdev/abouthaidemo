odoo.define('pos_retail.GiftCardScreen', function (require) {
    'use strict';

    const {debounce} = owl.utils;
    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const {useListener} = require('web.custom_hooks');

    class GiftCardScreen extends PosComponent {
        constructor() {
            super(...arguments);
            this.cards = this.env.pos.db.get_cards()
            this.state = {
                cards: this.cards,
                query: null,
                selectedCard: this.props.card,
                selectedClient: this.props.selectedClient,
                detailIsShown: false,
                isEditMode: false,
                editModeProps: {
                    order: null,
                    selectedClient: null
                },
            };
            this.updatecardList = debounce(this.updatecardList, 70);
            useListener('filter-selected', this._onFilterSelected);
            useListener('search', this._onSearch);
            useListener('event-keyup-search-order', this._eventKeyupSearchCard);
            this.searchDetails = {};
            this.filter = null;
            this._initializeSearchFieldConstants();
        }

        mounted() {
            super.mounted()
        }

        willUnmount() {
            super.willUnmount()
        }

        reloadSaleLines() {
            let reload_models = _.filter(this.env.pos.models, function (model) {
                return model.model == 'sale.order.line';
            });
            if (reload_models.length > 0) {
                this.env.pos.load_server_data_by_model(reload_models[0]);
            }
        }

        back() {
            if (this.state.detailIsShown) {
                this.state.detailIsShown = false;
                this.render();
            } else {
                this.props.resolve({confirmed: false, payload: false});
                this.trigger('close-temp-screen');
            }
        }

        confirm() {
            this.props.resolve({confirmed: true, payload: this.state.selectedCard});
            this.trigger('close-temp-screen');
        }

        get currentOrder() {
            return this.env.pos.get_order();
        }

        get getCards() {
            const filterCheck = (card) => {
                if (this.filter && this.filter != 'all') {
                    if (this.filter == card.state) {
                        return true
                    } else {
                        return false
                    }
                }
                return true;
            };
            const {fieldValue, searchTerm} = this.searchDetails;
            const fieldAccessor = this._searchFields[fieldValue];
            const searchCheck = (order) => {
                if (!fieldAccessor) return true;
                const fieldValue = fieldAccessor(order);
                if (fieldValue === null) return true;
                if (!searchTerm) return true;
                return fieldValue && fieldValue.toString().toLowerCase().includes(searchTerm.toLowerCase());
            };
            const predicate = (order) => {
                return filterCheck(order) && searchCheck(order);
            };
            let cards = this.cardList.filter(predicate);
            if (this.props.selectedClient) {
                cards = cards.filter(c => c.partner_id && c.partner_id[0] == this.props.selectedClient.id)
            }
            return cards
        }

        get isNextButtonVisible() {
            return this.state.selectedCard ? true : false;
        }

        /**
         * Returns the text and command of the next button.
         * The command field is used by the clickNext call.
         */
        get nextButton() {
            if (!this.props.card) {
                return {command: 'set', text: 'Set Card'};
            } else if (this.props.card && this.props.card === this.state.selectedCard) {
                return {command: 'deselect', text: 'Deselect Card'};
            } else {
                return {command: 'set', text: 'Change Card'};
            }
        }

        // Methods

        // We declare this event handler as a debounce function in
        // order to lower its trigger rate.
        updatecardList(event) {
            this.state.query = event.target.value;
            const clients = this.clients;
            if (event.code === 'Enter' && clients.length === 1) {
                this.state.selectedCard = clients[0];
                this.clickNext();
            } else {
                this.render();
            }
        }

        clickCard(event) {
            let card = event.detail.card;
            this.state.selectedCard = card;
            this.state.editModeProps = {
                card: this.state.selectedCard,
                selectedCard: this.state.selectedCard
            };
            this.state.detailIsShown = true;
            this.render();
        }

        clickNext() {
            this.state.selectedCard = this.nextButton.command === 'set' ? this.state.selectedCard : null;
            this.confirm();
        }

        async reloadCards() {
            let reload_models = _.filter(this.env.pos.models, function (model) {
                return model.model == 'gift.card';
            });
            if (reload_models.length > 0) {
                await this.env.pos.load_server_data_by_model(reload_models[0]);
            }
        }

        clearSearch() {
            this._initializeSearchFieldConstants()
            this.filter = this.filterOptions[0];
            this.searchDetails = {};
            this.props.selectedClient = null
            this.cards = this.env.pos.db.get_cards()
            this.render()
        }


        // TODO: ==================== Search bar example ====================

        get searchBarConfig() {
            return {
                searchFields: this.constants.searchFieldNames,
                filter: {show: true, options: this.filterOptions},
                defaultSearchDetails: {
                    fieldName: 'RECEIPT_NUMBER',
                    searchTerm: '',
                },
                defaultFilter: null
            };
        }

        get _searchFields() {
            return {} // TODO: 15.07.2021 turnoff it, automatic search when cashier typing searchbox
        }

        // TODO: define group filters
        get filterOptions() { // list state for filter
            this.sepecialFilter = new Map()
            this.sepecialFilter.set('all', {
                key: 'all',
                text: this.env._t('All Cards'),
            })
            this.sepecialFilter.set('valid', {
                key: 'valid',
                text: this.env._t('Valid'),
            })
            this.sepecialFilter.set('expired', {
                key: 'expired',
                text: this.env._t('Expired'),
            })
            return this.sepecialFilter
        }


        // TODO: register search bar
        _initializeSearchFieldConstants() {
            this.constants = {};
            Object.assign(this.constants, {
                searchFieldNames: Object.keys(this._searchFields),
            });
        }

        // TODO: save filter selected on searchbox of user for getOrders()
        _onFilterSelected(event) {
            this.filter = event.detail.filter;
            this.render();
        }

        // TODO: save search detail selected on searchbox of user for getOrders()
        _onSearch(event) {
            const searchDetails = event.detail;
            Object.assign(this.searchDetails, searchDetails);
            this.render();
        }

        async _eventKeyupSearchCard(event) {
            const self = this
            const searchInput = event.detail
            if (searchInput != "") {
                this.cards = this.env.pos.db.search_cards(searchInput)
            } else {
                this.cards = this.env.pos.db.get_cards()
            }
            if (this.cards.length == 0) {
                let cardObject = this.env.pos.get_model('gift.card');
                let cards = await this.rpc({
                    model: cardObject.model,
                    method: 'search_read',
                    fields: cardObject.fields,
                    args: [['|', ['name', 'ilike', searchInput], ['code', 'ilike', searchInput]]]
                }).then(function (cards) {
                    return cards
                }, function (error) {
                    self.env.pos.alert_message({
                        title: self.env._t('Error'),
                        body: self.env._t('Odoo Server Offline or Your Internet have lose connection')
                    })
                    return null
                })
                if (cards && cards.length) {
                    this.env.pos.db.save_gift_cards(cards)
                    this.cards = this.env.pos.db.search_cards(searchInput)
                }
            }
            this.render()
        }

        // TODO: return orders of system
        get cardList() {
            return this.cards
        }
    }

    GiftCardScreen.template = 'GiftCardScreen';

    Registries.Component.add(GiftCardScreen);

    return GiftCardScreen;
});

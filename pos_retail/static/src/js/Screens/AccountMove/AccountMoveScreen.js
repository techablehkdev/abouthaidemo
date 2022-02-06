odoo.define('pos_retail.AccountInvoiceList', function (require) {
    'use strict';

    const {debounce} = owl.utils;
    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const {useListener} = require('web.custom_hooks');
    const {useState} = owl.hooks;

    class AccountMoveScreen extends PosComponent {
        constructor() {
            super(...arguments);
            this.state = useState({
                moves: this.env.pos.db.get_invoices(),
                query: null,
                selectedMove: this.props.move,
                detailIsShown: false,
                isEditMode: false,
                editModeProps: {
                    move: null
                },
                sort_field: null,
                reverse: true
            })
            this.updateOrderList = debounce(this.updateOrderList, 70);
            useListener('filter-selected', this._onFilterSelected);
            useListener('search', this._onSearch);
            useListener('event-keyup-search-order', this._eventKeyupSearchOrder);
            this.searchDetails = {};
            this.filter = null;
            this._initializeSearchFieldConstants();
            this.moves = this.env.pos.db.get_invoices()
        }

        _sortField(fieldSort, int=false) {
            this.state.sort_field = fieldSort
            this.state.reverse = !this.state.reverse
            this.state.sortInt = int
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
            this.props.resolve({confirmed: true, payload: this.state.selectedMove});
            this.trigger('close-temp-screen');
        }

        get getMoves() {
            const filterCheck = (move) => {
                if (this.filter && this.filter != 'all') {
                    if (this.filter == move.payment_state) {
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
            let moves = this.moveList.filter(predicate);
            if (this.state.sort_field) {
                if (this.state.sortInt) {
                    moves = moves.sort(this.env.pos.sort_by(this.state.sort_field, this.state.reverse, parseInt))
                } else {
                    moves = moves.sort(this.env.pos.sort_by(this.state.sort_field, this.state.reverse, function (a) {
                        if (!a) {
                            a = 'N/A'
                        }
                        return a.toUpperCase()
                    }))
                }
            } else {
                moves = moves.sort(this.env.pos.sort_by('id', true, parseInt))
            }
            return moves
        }

        get isNextButtonVisible() {
            return this.state.selectedMove ? true : false;
        }

        updateOrderList(event) {
            this.state.query = event.target.value;
        }

        clickMove(event) {
            let move = event.detail.move;
            this.state.selectedMove = move;
            this.state.editModeProps = {
                move: this.state.selectedMove,
            };
            this.state.detailIsShown = true;
            this.render();
        }

        clickNext() {
            this.state.selectedMove = this.nextButton.command === 'set' ? this.state.selectedMove : null;
            this.confirm();
        }

        async clearSearch() {
            this.state.loading = true
            await this.env.pos.getAccountMoves()
            this._initializeSearchFieldConstants()
            this.filter = this.filterOptions[0];
            this.searchDetails = {};
            this.moves = this.env.pos.db.get_invoices()
            this.state.sort_field = null
            this.state.loading = false
        }


        // TODO: ==================== Seach bar example ====================

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
            return {}
        }

        // TODO: define group filters
        get filterOptions() {
            this.sepecialFilter = new Map()
            this.sepecialFilter.set('all', {
                key: 'all',
                text: this.env._t('All Invoice'),
            })
            this.sepecialFilter.set('not_paid', {
                key: 'not_paid',
                text: this.env._t('Not Paid'),
            })
            this.sepecialFilter.set('in_payment', {
                key: 'in_payment',
                text: this.env._t('In Payment'),
            })
            this.sepecialFilter.set('paid', {
                key: 'paid',
                text: this.env._t('Paid'),
            })
            this.sepecialFilter.set('partial', {
                key: 'partial',
                text: this.env._t('Partially Paid'),
            })
            this.sepecialFilter.set('reversed', {
                key: 'reversed',
                text: this.env._t('Reversed'),
            })
            this.sepecialFilter.set('invoicing_legacy', {
                key: 'invoicing_legacy',
                text: this.env._t('Invoicing App Legacy'),
            })
            return this.sepecialFilter
        }

        get _stateSelectionFilter() {
            return {
                draft: 'Draft',
                posted: 'Posted',
                cancel: 'Cancelled',
            };
        }

        // TODO: register search bar
        _initializeSearchFieldConstants() {
            this.constants = {};
            Object.assign(this.constants, {
                searchFieldNames: Object.keys(this._searchFields),
                stateSelectionFilter: this._stateSelectionFilter,
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

        async _eventKeyupSearchOrder(event) {
            const searchInput = event.detail
            if (searchInput != "") {
                this.moves = this.env.pos.db.search_invoice(searchInput)
            } else {
                this.moves = this.env.pos.db.get_invoices()
            }
            if (this.moves.length == 0) {
                let invoiceObject = this.env.pos.get_model('account.move');
                let moves = await this.rpc({
                    model: invoiceObject.model,
                    method: 'search_read',
                    fields: invoiceObject.fields,
                    domain: ['|', ['name', 'ilike', searchInput], ['payment_reference', 'ilike', searchInput]]
                }).then(function (moves) {
                    return moves
                }, function (error) {
                    self.env.pos.alert_message({
                        title: self.env._t('Error'),
                        body: self.env._t('Odoo Server Offline or Your Internet have lose connection')
                    })
                    return null
                })
                if (moves && moves.length) {
                    let moveIds = []
                    this.env.pos.saveMoves(moves)
                    moves.forEach(o => {
                        moveIds.push(o.id)
                    })
                    let moveLineObject = this.env.pos.get_model('account.move.line');
                    let moveLines = await this.rpc({
                        model: moveLineObject.model,
                        method: 'search_read',
                        fields: moveLineObject.fields,
                        args: [[['move_id', 'in', moveIds]]]
                    })
                    this.env.pos.db.save_invoice_lines(moveLines)
                    this.moves = this.env.pos.db.search_invoice(searchInput)
                }
            }
            this.render()
        }

        // TODO: return orders of system
        get moveList() {
            return this.moves
        }
    }

    AccountMoveScreen.template = 'AccountMoveScreen';

    Registries.Component.add(AccountMoveScreen);

    return AccountMoveScreen;
});

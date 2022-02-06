odoo.define('pos_retail.ProductsWidgetControlPanel', function (require) {
    'use strict';

    const ProductsWidgetControlPanel = require('point_of_sale.ProductsWidgetControlPanel');
    const {useState} = owl.hooks;
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');
    const {posbus} = require('point_of_sale.utils');

    const RetailProductsWidgetControlPanel = (ProductsWidgetControlPanel) =>
        class extends ProductsWidgetControlPanel {
            constructor() {
                super(...arguments)
                const self = this
                useListener('filter-selected', this._onFilterSelected)
                useListener('search', this._onSearch)
                useListener('clear-search-product-filter', this.clearFilter)
                useListener('show-categories', this._showCategories)
                this.state = useState({
                    activeExtendFilter: false,
                    showAllCategory: this.env.pos.showAllCategory
                })
                this.searchDetails = {}
                this.filter = null
                this._initializeSearchFieldConstants()
                this.sepecialFilter = new Map()
                this.sepecialFilter.set('all', {
                    key: 'all',
                    text: this.env._t('All Items'),
                })
                this.sepecialFilter.set('out_stock', {
                    key: 'out_stock',
                    text: this.env._t('Out of Stock'),
                })
                this.sepecialFilter.set('available_stock', {
                    key: 'available_stock',
                    text: this.env._t('Available Stock'),
                })
                this.sepecialFilter.set('tracking_lot', {
                    key: 'tracking_lot',
                    text: this.env._t('Tracking by Lot/Serial'),
                })
                this.sepecialFilter.set('is_combo', {
                    key: 'bundle',
                    text: this.env._t('Bundle Pack/Combo'),
                })
                this.sepecialFilter.set('addon_id', {
                    key: 'addons_items',
                    text: this.env._t('Included Add-ons Items'),
                })
                this.sepecialFilter.set('multi_variant', {
                    key: 'multi_variant',
                    text: this.env._t('Multi Variant'),
                })
                this.sepecialFilter.set('multi_unit', {
                    key: 'multi_unit',
                    text: this.env._t('Multi Unit Of Measure'),
                })
                this.sepecialFilter.set('multi_barcode', {
                    key: 'multi_barcode',
                    text: this.env._t('Multi Barcode'),
                })
            }

            mounted() {
                super.mounted();
            }

            willUnmount() {
                super.willUnmount()
            }

            _showCategories() {
                this.env.pos.showAllCategory = !this.env.pos.showAllCategory
                this.state.showAllCategory = this.env.pos.showAllCategory
                this.trigger('switch-category', 0)
            }

            get rootCategoryNotSelected() {
                let selectedCategoryId = this.env.pos.get('selectedCategoryId')
                if (selectedCategoryId == 0) {
                    return true
                } else {
                    return false
                }
            }

            get Categories() {
                const allCategories = this.env.pos.db.category_by_id
                let categories = []
                for (let index in allCategories) {
                    categories.push(allCategories[index])
                }
                return categories
            }

            showExtendSearch() {
                this.state.activeExtendFilter = !this.state.activeExtendFilter
            }

            clearSearch() {
                this.env.pos.set('search_extends_results', null)
                this.searchDetails = {};
                super.clearSearch()
                posbus.trigger('reload-products-screen')
                posbus.trigger('remove-filter-attribute')
            }

            clearFilter() {
                this.env.pos.set('search_extends_results', null)
                this.searchDetails = {};
                posbus.trigger('reload-products-screen')
                posbus.trigger('remove-filter-attribute')
                this.render()
            }

            // TODO: ==================== Search bar example ====================
            get searchBarConfig() {
                const config = {
                    searchFields: this.constants.searchFieldNames,
                    filter: {show: true, options: this.filterOptions},
                    defaultSearchDetails: {
                        fieldName: 'RECEIPT_NUMBER',
                        searchTerm: '',
                    },
                    defaultFilter: null
                }
                return config
            }

            // TODO: define search fields
            get _searchFields() {
                var fields = {
                    'String': (product) => product.search_extend,
                    'Product Name': (product) => product.name,
                    'Internal Reference': (product) => product.default_code,
                    'Barcode': (product) => product.barcode,
                    'Supplier Code': (product) => product.supplier_barcode,
                    'Price is': (product) => product.lst_price,
                    'Sale Category': (product) => product.categ_id[1],
                    'Internal Notes': (product) => product.description,
                    'Description Sale': (product) => product.description_sale,
                    'Description Picking': (product) => product.description_picking,
                    'ID': (product) => product.id,
                };
                return fields;
            }

            get filterOptions() {
                return this.sepecialFilter
            }

            get _stateSelectionFilter() {
                return {}
            }

            _initializeSearchFieldConstants() {
                this.constants = {};
                Object.assign(this.constants, {
                    searchFieldNames: Object.keys(this._searchFields),
                    stateSelectionFilter: this._stateSelectionFilter,
                });
            }

            _onFilterSelected(event) {
                this.filter = event.detail.filter;
                this._autoComplete()
            }

            _onSearch(event) {
                const searchDetails = event.detail;
                Object.assign(this.searchDetails, searchDetails);
                this._autoComplete()
            }

            _autoComplete() {
                const filterCheck = (product) => {
                    if (this.filter == 'all') {
                        return true
                    }
                    if (this.filter == 'out_stock') {
                        if (product['type'] != 'service' && product.qty_available && product.qty_available <= 0) {
                            return true
                        } else {
                            return false
                        }
                    }
                    if (this.filter == 'available_stock') {
                        if (product['type'] != 'service' && product.qty_available && product.qty_available > 0) {
                            return true
                        } else {
                            return false
                        }
                    }
                    if (this.filter == 'tracking_lot') {
                        if (product['tracking'] != 'none') {
                            return true
                        } else {
                            return false
                        }
                    }
                    if (this.filter == 'is_combo') {
                        if (product.is_combo) {
                            return true
                        } else {
                            return false
                        }
                    }
                    if (this.filter == 'addon_id') {
                        if (product.addon_id) {
                            return true
                        } else {
                            return false
                        }
                    }
                    if (this.filter == 'multi_variant') {
                        if (product.multi_variant) {
                            return true
                        } else {
                            return false
                        }
                    }
                    if (this.filter == 'multi_unit') {
                        if (product.multi_unit) {
                            return true
                        } else {
                            return false
                        }
                    }
                    if (this.filter == 'multi_barcode') {
                        if (product.barcode_ids && product.barcode_ids.length != 0) {
                            return true
                        } else {
                            return false
                        }
                    }
                    this.clearSearch()
                    return true;
                };
                const {fieldValue, searchTerm} = this.searchDetails;
                const fieldAccessor = this._searchFields[fieldValue];
                const searchCheck = (product) => {
                    if (!fieldAccessor) return true;
                    const fieldValue = fieldAccessor(product);
                    if (fieldValue === null) return true;
                    if (!searchTerm) return true;
                    return fieldValue && fieldValue.toString().toLowerCase().includes(searchTerm.toLowerCase());
                };
                const predicate = (product) => {
                    return filterCheck(product) && searchCheck(product);
                };
                let products = []
                if (this.filter == 'all') {
                    products = this.env.pos.db.get_product_by_category(0);
                } else {
                    products = this.env.pos.db.getAllProducts(1000);
                }
                products = products.filter(predicate);
                this.env.pos.set('search_extends_results', products)
                posbus.trigger('reload-products-screen')
                posbus.trigger('remove-filter-attribute')
            }
        }
    Registries.Component.extend(ProductsWidgetControlPanel, RetailProductsWidgetControlPanel);

    return RetailProductsWidgetControlPanel;
});

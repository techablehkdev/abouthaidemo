odoo.define('pos_retail.ProductsWidget', function (require) {
    'use strict';

    const ProductsWidget = require('point_of_sale.ProductsWidget')
    const Registries = require('point_of_sale.Registries')
    const {posbus} = require('point_of_sale.utils')
    const {useState} = owl.hooks;
    const {useListener} = require('web.custom_hooks');

    const RetailProductsWidget = (ProductsWidget) =>
        class extends ProductsWidget {
            constructor() {
                super(...arguments);
                this.productsRecommendations = []
                this.env.pos.set('search_extends_results', null)
                useListener('trigger-sort-product-fields', this._sortField);
                this.status = useState({
                    sort_field: null,
                    reverse: true
                })
            }

            _sortField(event) {
                this.status.sort_field = event.detail.field
                this.status.reverse = !this.status.reverse
                this.status.sortInt = event.detail.int
            }

            mounted() {
                const self = this;
                super.mounted();
                posbus.on('reload-products-screen', this, this.render);
                this.env.pos.on(
                    'change:search_extends_results',
                    (pos, products) => {
                        console.log('search_extends_results')
                        console.log(products)
                    },
                    this
                );
                this.env.pos.on(
                    'change:ProductRecommendations',
                    (pos, productRecommentIds) => {
                        self.productsRecommendations = []
                        for (let i = 0; i < productRecommentIds.length; i++) {
                            let product = self.env.pos.db.get_product_by_id(productRecommentIds[i]);
                            if (product) {
                                self.productsRecommendations.push(product)
                            }
                        }
                        self.render()
                        setTimeout(() => {
                            self.productsRecommendations = []
                        }, 1000)

                    },
                    this
                );
                this.env.pos.on(
                    'change:productsModifiers',
                    (pos, product_ids) => {
                        self.product_modifier_ids = product_ids
                        self.product_modifiers = []
                        for (let i = 0; i < product_ids.length; i++) {
                            let product = self.env.pos.db.get_product_by_id(product_ids[i]);
                            if (product) {
                                product.modifiers = true
                                self.product_modifiers.push(product)
                            }
                        }
                        self.render()
                        setTimeout(() => {
                            self.product_modifier_ids = []
                            self.product_modifiers = []
                        }, 1000)
                    },
                    this
                );
                this.env.pos.on('change:selectedBrandId', this.render, this);
                this.env.pos.on('change:selectedSaleCategoryId', this.render, this);
            }

            willUnmount() {
                super.willUnmount();
                posbus.off('reload-products-screen', null, this);
                this.env.pos.off('change:selectedBrandId', null, this);
                this.env.pos.off('change:selectedSaleCategoryId', null, this);
                this.env.pos.off('change:search_extends_results', null, this);
                this.env.pos.off('change:ProductRecommendations', null, this);
            }

            // TODO: odoo original used this.searchWordInput = useRef('search-word-input') from ProductsWidgetControlPanel
            // but we not use it, we trigger this function for get event press Enter of user and try add product
            async _tryAddProduct(event) {
                const {searchWordInput} = event.detail;
                if (searchWordInput && searchWordInput.el) {
                    return super._tryAddProduct(event)
                } else {
                    const searchResults = this.productsToDisplay;
                    if (searchResults.length == 0) {
                        return true
                    }
                    if (searchResults.length === 1) {
                        this.trigger('click-product', searchResults[0]);
                        posbus.trigger('clear-search-bar')
                        this._clearSearch()
                    }
                }
            }

            get subcategories() {
                if (this.env.pos.config.categ_dislay_type == 'all') {
                    this.env.pos.pos_categories = this.env.pos.pos_categories.sort(function (a, b) {
                        return a.sequence - b.sequence
                    })
                    return this.env.pos.pos_categories
                } else {
                    return super.subcategories
                }
            }

            get hasNoCategories() {
                // kimanh: we force odoo for always return false, default odoo always hide if have not any categories
                return false
            }

            get selectedBrandId() {
                return this.env.pos.get('selectedBrandId');
            }

            get selectedSaleCategoryId() {
                return this.env.pos.get('selectedSaleCategoryId');
            }

            _updateSearch(event) {
                super._updateSearch(event)
                if (this.env.pos.config.quickly_look_up_product && this.searchWord) {
                    const products = this.env.pos.db.search_product_in_category(
                        this.selectedCategoryId,
                        this.searchWord
                    );
                    if (products.length == 1) {
                        this.trigger('click-product', products[0]);
                        posbus.trigger('clear-search-bar')
                        this.env.pos.alert_message({
                            title: this.env._t('Automatic Lookup Product'),
                            body: products[0]['display_name'] + this.env._t(' Automatic add to Cart !')
                        })
                    }
                }
            }

            // -------- *** ----------
            // TODO: this function can help us render any products we need or block any products we need filter by backend setting
            // -------- *** ----------
            get productsToDisplay() {
                const self = this;
                if (this.productsRecommendations && this.productsRecommendations.length > 0) {
                    console.log('Render recommendations : ' + this.productsRecommendations.length)
                    return this.productsRecommendations
                }
                let productsWillDisplay = super.productsToDisplay;
                let search_extends_results = this.env.pos.get('search_extends_results')
                if (search_extends_results != null) {
                    productsWillDisplay = search_extends_results
                    if (this.selectedCategoryId && this.selectedCategoryId != 0) {
                        productsWillDisplay = productsWillDisplay.filter(p => p.pos_categ_id && p.pos_categ_id[0] == this.selectedCategoryId)
                    }
                }
                if (this.env.pos.config.hidden_product_ids && this.env.pos.config.hidden_product_ids.length > 0) {
                    productsWillDisplay = productsWillDisplay.filter(p => !this.env.pos.config.hidden_product_ids.includes(p.id))
                }
                if (this.selectedBrandId && this.selectedBrandId != 0) {
                    productsWillDisplay = productsWillDisplay.filter(p => p.product_brand_id && p.product_brand_id[0] == this.selectedBrandId)
                }
                if (this.selectedSaleCategoryId && this.selectedSaleCategoryId != 0) {
                    productsWillDisplay = productsWillDisplay.filter(p => p.categ_id && p.categ_id[0] == this.selectedSaleCategoryId)
                }
                // limited maximum display is 100 products
                let productsLimitedDisplay = []
                for (let i = 0; i < productsWillDisplay.length; i++) {
                    if (i <= this.env.pos.db.limit) {
                        productsLimitedDisplay.push(productsWillDisplay[i])
                    } else {
                        break
                    }
                }
                return productsWillDisplay
            }

            _sortProduct(products) {
                if (this.status.sort_field) {
                    if (this.status.sortInt) {
                        products = products.sort(this.env.pos.sort_by(this.status.sort_field, this.status.reverse, parseInt))
                    } else {
                        products = products.sort(this.env.pos.sort_by(this.status.sort_field, this.status.reverse, function (a) {
                            if (!a) {
                                a = 'N/A'
                            }
                            return a.toUpperCase()
                        }))
                    }
                } else {
                    if (this.env.pos.config.default_product_sort_by == 'a_z') {
                        products = products.sort(this.env.pos.sort_by('display_name', false, function (a) {
                            if (!a) {
                                a = 'N/A';
                            }
                            return a.toUpperCase()
                        }));
                    } else if (this.env.pos.config.default_product_sort_by == 'z_a') {
                        products = products.sort(this.env.pos.sort_by('display_name', true, function (a) {
                            if (!a) {
                                a = 'N/A';
                            }
                            return a.toUpperCase()
                        }));
                    } else if (this.env.pos.config.default_product_sort_by == 'low_price') {
                        products = products.sort(this.env.pos.sort_by('lst_price', false, parseInt));
                    } else if (this.env.pos.config.default_product_sort_by == 'high_price') {
                        products = products.sort(this.env.pos.sort_by('lst_price', true, parseInt));
                    } else if (this.env.pos.config.default_product_sort_by == 'pos_sequence') {
                        products = products.sort(this.env.pos.sort_by('pos_sequence', true, parseInt));
                    }
                }
                return products
            }

            _switchCategory(event) {
                super._switchCategory(event)
                if (event.detail == 0) { // Todo: event.detail is categoryID, if ID is 0, it mean go to root category and clear search
                    this._clearSearch()
                    this.render()
                }
            }

            async _clearSearch() {
                this.env.pos.set('selectedBrandId', 0);
                this.env.pos.set('selectedSaleCategoryId', 0);
                this.env.pos.set('search_extends_results', null)
                super._clearSearch()
            }

            get blockScreen() {
                const selectedOrder = this.env.pos.get_order();
                if (!selectedOrder || !selectedOrder.is_return) {
                    return false
                } else {
                    return true
                }
            }
        }
    Registries.Component.extend(ProductsWidget, RetailProductsWidget);

    return RetailProductsWidget;
});

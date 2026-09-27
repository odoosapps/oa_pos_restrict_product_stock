{
    'name': 'POS Stock Display & Restrict Out of Stock | Odoos Apps',

    'version': '18.0.1.0.0',
    'category': 'Point of Sale',
    'sequence': -1300,
    'license': 'AGPL-3',

    'summary': """Display real-time product stock in POS and restrict ordering out-of-stock items""",
    'description': """This module enables cashiers to view real-time location-scoped stock (On Hand and Forecasted) on product cards in POS and restricts adding or paying for out-of-stock items.""",

    'author': 'Odoos Apps',
    'website': 'https://odoosapps.tech',
    'maintainer': 'Odoos Apps',
    'support':'odoosapps@gmail.com',

    # 'currency': 'USD',
    # 'price': '',


    'depends': ['point_of_sale'],
    'data': [
        'views/res_config_settings_views.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'oa_pos_restrict_product_stock/static/src/js/ProductScreen.js',
            'oa_pos_restrict_product_stock/static/src/js/OrderScreen.js',
            'oa_pos_restrict_product_stock/static/src/js/ProductConfiguratorPopup.js',
            'oa_pos_restrict_product_stock/static/src/css/oa_display_stock.css',
            'oa_pos_restrict_product_stock/static/src/xml/ProductItem.xml',
        ],
    },
    'images': ['static/description/banner.jpg'],

    'installable': True,
    'application': True,
    'auto_install': False,
}

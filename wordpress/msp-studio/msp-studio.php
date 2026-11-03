<?php
/**
 * Plugin Name:       MSP Studio
 * Plugin URI:        https://musicsideproject.com
 * Description:       Build Podcasting 2.0 music, video and publisher feeds in your WordPress admin, and host them on your own site.
 * Version:           0.0.0
 * Requires at least: 6.2
 * Requires PHP:      7.4
 * Author:            Music Side Project
 * Author URI:        https://musicsideproject.com
 * License:           MIT
 * License URI:       https://opensource.org/licenses/MIT
 * Text Domain:       msp-studio
 *
 * The Version line above is stamped by tools/build-wp-plugin.mjs from the same
 * git-derived version the website shows; 0.0.0 means an unbuilt checkout.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'MSP_STUDIO_FILE', __FILE__ );
define( 'MSP_STUDIO_DIR', plugin_dir_path( __FILE__ ) );
define( 'MSP_STUDIO_URL', plugin_dir_url( __FILE__ ) );

/**
 * The MSP API the editor calls for Podcast Index, podping, the reachability
 * check, Host on MSP and email login. Override in wp-config.php to point a
 * test site at a preview deployment.
 */
if ( ! defined( 'MSP_STUDIO_API' ) ) {
	define( 'MSP_STUDIO_API', 'https://musicsideproject.com' );
}

require_once MSP_STUDIO_DIR . 'includes/class-feed-store.php';
require_once MSP_STUDIO_DIR . 'includes/class-public-feed.php';
require_once MSP_STUDIO_DIR . 'includes/class-rest.php';
require_once MSP_STUDIO_DIR . 'includes/class-admin.php';

/**
 * Who may use MSP Studio. Feeds carry Lightning payment splits, so the default
 * is site administrators; a site can widen it with this filter.
 */
function msp_studio_capability() {
	return (string) apply_filters( 'msp_studio_capability', 'manage_options' );
}

MSP_Studio_Feed_Store::init();
MSP_Studio_Public_Feed::init();
MSP_Studio_REST::init();
MSP_Studio_Admin::init();

register_activation_hook(
	__FILE__,
	static function () {
		MSP_Studio_Feed_Store::register_post_type();
		MSP_Studio_Public_Feed::add_rewrite_rule();
		flush_rewrite_rules();
	}
);

register_deactivation_hook(
	__FILE__,
	static function () {
		flush_rewrite_rules();
	}
);

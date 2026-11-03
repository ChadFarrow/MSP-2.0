<?php
/**
 * The "MSP Studio" admin page.
 *
 * The editor runs in a full-height iframe whose page comes from this same
 * WordPress site (admin-post.php?action=msp_studio_app). Why a frame and not a
 * <div> in the admin page: the editor's stylesheet resets every element, sets
 * html/body to 100% height, writes data-theme on <html> and portals menus to
 * <body> — mounted into wp-admin, all of that would break the admin's own
 * layout. A same-origin frame isolates the CSS completely while still sharing
 * this site's cookies, localStorage and (for the Media Library) its window.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class MSP_Studio_Admin {

	const SLUG   = 'msp-studio';
	const ACTION = 'msp_studio_app';

	/** @var string */
	private static $hook = '';

	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'add_menu' ) );
		add_action( 'admin_post_' . self::ACTION, array( __CLASS__, 'render_app' ) );
	}

	public static function add_menu() {
		self::$hook = (string) add_menu_page(
			__( 'MSP Studio', 'msp-studio' ),
			__( 'MSP Studio', 'msp-studio' ),
			msp_studio_capability(),
			self::SLUG,
			array( __CLASS__, 'render_page' ),
			'dashicons-format-audio',
			26
		);
		add_action( 'admin_head-' . self::$hook, array( __CLASS__, 'page_styles' ) );
	}

	public static function page_styles() {
		?>
		<style>
			#wpcontent { padding-left: 0; }
			#wpbody-content { padding-bottom: 0; }
			#wpfooter { display: none; }
			.msp-studio-frame { display: block; width: 100%; height: calc(100vh - 32px); border: 0; }
			@media screen and (max-width: 782px) {
				.msp-studio-frame { height: calc(100vh - 46px); }
			}
		</style>
		<?php
	}

	public static function render_page() {
		if ( ! current_user_can( msp_studio_capability() ) ) {
			wp_die( esc_html__( 'You do not have permission to use MSP Studio.', 'msp-studio' ) );
		}
		$src = add_query_arg( 'action', self::ACTION, admin_url( 'admin-post.php' ) );
		printf(
			'<iframe class="msp-studio-frame" src="%s" title="%s" allow="clipboard-write"></iframe>',
			esc_url( $src ),
			esc_attr__( 'MSP Studio editor', 'msp-studio' )
		);
	}

	/**
	 * The editor page itself: the built index.html with a <base> pointing at
	 * the bundle's folder and the settings the editor reads as window.MSP_WP.
	 */
	public static function render_app() {
		if ( ! current_user_can( msp_studio_capability() ) ) {
			wp_die( esc_html__( 'You do not have permission to use MSP Studio.', 'msp-studio' ), 403 );
		}

		$index = MSP_STUDIO_DIR . 'build/index.html';
		if ( ! is_readable( $index ) ) {
			wp_die( esc_html__( 'MSP Studio is not built. Install the plugin zip, or run "npm run build:wp" in the MSP repository.', 'msp-studio' ), 500 );
		}
		$html = (string) file_get_contents( $index ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- local file.

		$config = array(
			'restUrl'     => esc_url_raw( rest_url() ),
			'nonce'       => wp_create_nonce( 'wp_rest' ),
			'siteUrl'     => home_url( '/' ),
			'feedBaseUrl' => MSP_Studio_Public_Feed::base_url(),
			'mspApi'      => MSP_STUDIO_API,
		);
		$inject = sprintf(
			"<base href=\"%s\">\n<script>window.MSP_WP = %s;</script>\n",
			esc_url( MSP_STUDIO_URL . 'build/' ),
			wp_json_encode( $config, JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_SLASHES )
		);
		// <base> must come before any relative URL in the document.
		// A callback, not a replacement string: "$" and "\" in the injected JSON
		// would otherwise be read as backreferences.
		$html = preg_replace_callback(
			'/<head(\s[^>]*)?>/i',
			static function ( $m ) use ( $inject ) {
				return $m[0] . "\n" . $inject;
			},
			$html,
			1
		);

		nocache_headers();
		header( 'Content-Type: text/html; charset=utf-8' );
		header( 'X-Frame-Options: SAMEORIGIN' );
		echo $html; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- the plugin's own built page; injected values are escaped above.
		exit;
	}
}

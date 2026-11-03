<?php
/**
 * REST routes the editor calls, under /wp-json/msp/v1/.
 *
 * Every route requires the plugin capability. WordPress authenticates a REST
 * request from the logged-in admin by cookie only when it carries the
 * `wp_rest` nonce (X-WP-Nonce), which the editor sends; without it the user is
 * treated as logged out and the capability check fails.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class MSP_Studio_REST {

	const NS = 'msp/v1';

	/** WordPress has no 4.5 MB response ceiling, unlike MSP's Vercel proxy. */
	const PROXY_MAX_BYTES = 20971520;
	const PROXY_SNIFF_BYTES = 65536;

	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
		add_filter( 'rest_pre_serve_request', array( __CLASS__, 'serve_raw_xml' ), 10, 4 );
	}

	public static function can_use() {
		return current_user_can( msp_studio_capability() );
	}

	public static function register_routes() {
		$guid_arg = array(
			'guid' => array(
				'type'              => 'string',
				'validate_callback' => array( 'MSP_Studio_Feed_Store', 'is_valid_guid' ),
			),
		);

		register_rest_route(
			self::NS,
			'/feeds',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( __CLASS__, 'list_feeds' ),
				'permission_callback' => array( __CLASS__, 'can_use' ),
			)
		);

		register_rest_route(
			self::NS,
			'/feeds/(?P<guid>[0-9a-fA-F-]{36})',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( __CLASS__, 'get_feed' ),
					'permission_callback' => array( __CLASS__, 'can_use' ),
					'args'                => $guid_arg,
				),
				array(
					'methods'             => 'PUT',
					'callback'            => array( __CLASS__, 'put_feed' ),
					'permission_callback' => array( __CLASS__, 'can_use' ),
					'args'                => $guid_arg,
				),
				array(
					'methods'             => WP_REST_Server::DELETABLE,
					'callback'            => array( __CLASS__, 'delete_feed' ),
					'permission_callback' => array( __CLASS__, 'can_use' ),
					'args'                => $guid_arg,
				),
			)
		);

		register_rest_route(
			self::NS,
			'/proxy-feed',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( __CLASS__, 'proxy_feed' ),
				'permission_callback' => array( __CLASS__, 'can_use' ),
				'args'                => array(
					'url' => array(
						'type'     => 'string',
						'required' => true,
					),
				),
			)
		);
	}

	private static function summary( WP_Post $post ) {
		$guid = (string) get_post_meta( $post->ID, MSP_Studio_Feed_Store::META_GUID, true );
		return array(
			'guid'     => $guid,
			'title'    => html_entity_decode( get_the_title( $post ), ENT_QUOTES, 'UTF-8' ),
			'medium'   => (string) get_post_meta( $post->ID, MSP_Studio_Feed_Store::META_MEDIUM, true ),
			'url'      => MSP_Studio_Public_Feed::url_for( $guid ),
			'modified' => mysql_to_rfc3339( $post->post_modified_gmt ),
		);
	}

	public static function list_feeds() {
		return rest_ensure_response( array_map( array( __CLASS__, 'summary' ), MSP_Studio_Feed_Store::all() ) );
	}

	public static function get_feed( WP_REST_Request $request ) {
		$post = MSP_Studio_Feed_Store::find( $request['guid'] );
		if ( ! $post ) {
			return new WP_Error( 'msp_not_found', __( 'No feed with that GUID on this site.', 'msp-studio' ), array( 'status' => 404 ) );
		}
		return rest_ensure_response(
			array_merge( self::summary( $post ), array( 'xml' => MSP_Studio_Feed_Store::get_xml( $post ) ) )
		);
	}

	public static function put_feed( WP_REST_Request $request ) {
		$result = MSP_Studio_Feed_Store::save( $request['guid'], $request->get_param( 'xml' ), $request->get_param( 'title' ) );
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		$response = self::summary( $result['post'] );
		$response['created'] = $result['created'];
		return new WP_REST_Response( $response, $result['created'] ? 201 : 200 );
	}

	public static function delete_feed( WP_REST_Request $request ) {
		if ( ! MSP_Studio_Feed_Store::delete( $request['guid'] ) ) {
			return new WP_Error( 'msp_not_found', __( 'No feed with that GUID on this site.', 'msp-studio' ), array( 'status' => 404 ) );
		}
		return rest_ensure_response( array( 'deleted' => true ) );
	}

	/**
	 * The editor's feed fetcher for "Import from URL" and the publisher
	 * catalog tools, standing in for MSP's /api/proxy-feed. WordPress fetches
	 * the feed itself, so MSP's proxy never has to open to every origin.
	 *
	 * Not an open relay: only a logged-in user with the plugin capability can
	 * call it. Mirrors the bargain MSP's proxy strikes — returns only
	 * feed-shaped, size-capped bytes, refuses rather than truncates, forces the
	 * content type — and errors use the same { error, code, status } shape so
	 * the editor's messages (CODE_MESSAGES in xmlParser.ts) apply unchanged.
	 */
	public static function proxy_feed( WP_REST_Request $request ) {
		$url = trim( (string) $request->get_param( 'url' ) );
		$parts = wp_parse_url( $url );
		if ( ! $parts || empty( $parts['host'] ) || ! in_array( strtolower( (string) ( $parts['scheme'] ?? '' ) ), array( 'http', 'https' ), true ) ) {
			return self::proxy_error( 'invalid-url', 'Invalid URL', 400 );
		}
		if ( isset( $parts['user'] ) || isset( $parts['pass'] ) ) {
			return self::proxy_error( 'invalid-url', 'URLs with credentials are not fetched', 400 );
		}
		if ( ! wp_http_validate_url( $url ) ) {
			return self::proxy_error( 'unsafe-address', 'That address is not public', 400 );
		}

		// wp_safe_remote_get re-validates every redirect hop against private and
		// reserved addresses (reject_unsafe_urls), which is the same per-hop
		// check MSP's safeFetch does.
		$response = wp_safe_remote_get(
			$url,
			array(
				'timeout'             => 20,
				'redirection'         => 10,
				'limit_response_size' => self::PROXY_MAX_BYTES + 1,
				'user-agent'          => 'MSP Studio for WordPress (+https://musicsideproject.com)',
				'headers'             => array( 'Accept' => 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5' ),
			)
		);

		if ( is_wp_error( $response ) ) {
			$message = $response->get_error_message();
			if ( false !== stripos( $message, 'timed out' ) ) {
				return self::proxy_error( 'timeout', $message, 504 );
			}
			if ( false !== stripos( $message, 'redirect' ) ) {
				return self::proxy_error( 'too-many-redirects', $message, 502 );
			}
			if ( false !== stripos( $message, 'valid URL' ) ) {
				return self::proxy_error( 'unsafe-address', $message, 400 );
			}
			return self::proxy_error( 'network', $message, 502 );
		}

		$status = (int) wp_remote_retrieve_response_code( $response );
		if ( 404 === $status || 410 === $status ) {
			return self::proxy_error( 'not-found', 'Upstream returned ' . $status, 502, $status );
		}
		if ( in_array( $status, array( 401, 403, 429 ), true ) ) {
			return self::proxy_error( 'blocked', 'Upstream returned ' . $status, 502, $status );
		}
		if ( $status < 200 || $status >= 300 ) {
			return self::proxy_error( 'upstream-error', 'Upstream returned ' . $status, 502, $status );
		}

		$body = (string) wp_remote_retrieve_body( $response );
		if ( strlen( $body ) > self::PROXY_MAX_BYTES ) {
			return self::proxy_error( 'too-large', 'Feed is larger than 20 MB', 413 );
		}
		$head = substr( $body, 0, self::PROXY_SNIFF_BYTES );
		if ( false === strpos( $head, '<rss' ) && false === strpos( $head, '<feed' ) && false === strpos( $head, '<channel' ) ) {
			return self::proxy_error( 'not-a-feed', 'Response is not an RSS or Atom feed', 422 );
		}

		$out = new WP_REST_Response( $body, 200 );
		$out->header( 'Content-Type', 'application/xml; charset=utf-8' );
		$out->header( 'X-Content-Type-Options', 'nosniff' );
		$out->header( 'Cache-Control', 'no-store' );
		return $out;
	}

	private static function proxy_error( $code, $message, $http, $upstream = null ) {
		$data = array(
			'error' => $message,
			'code'  => $code,
		);
		if ( null !== $upstream ) {
			$data['status'] = $upstream;
		}
		return new WP_REST_Response( $data, $http );
	}

	/**
	 * The REST server JSON-encodes every response. A successful proxy response
	 * is a feed and goes out as raw XML instead.
	 */
	public static function serve_raw_xml( $served, $result, $request, $server ) {
		if ( $served || '/' . self::NS . '/proxy-feed' !== $request->get_route() ) {
			return $served;
		}
		if ( ! ( $result instanceof WP_HTTP_Response ) || 200 !== $result->get_status() || ! is_string( $result->get_data() ) ) {
			return $served;
		}
		echo $result->get_data(); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- feed bytes, sent as application/xml with nosniff.
		return true;
	}
}

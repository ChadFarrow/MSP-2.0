<?php
/**
 * Serves each saved feed at a permanent public address:
 *   https://example.com/msp-feeds/<guid>.xml   (pretty permalinks)
 *   https://example.com/?msp_feed=<guid>.xml   (plain permalinks)
 *
 * This address goes into podcast apps and Podcast Index, so it must never
 * change for a feed. Both forms are always answered.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class MSP_Studio_Public_Feed {

	const QUERY_VAR = 'msp_feed';

	public static function init() {
		add_action( 'init', array( __CLASS__, 'add_rewrite_rule' ) );
		add_filter( 'query_vars', array( __CLASS__, 'query_vars' ) );
		add_action( 'template_redirect', array( __CLASS__, 'maybe_serve' ), 0 );
	}

	public static function add_rewrite_rule() {
		add_rewrite_rule( '^msp-feeds/([0-9a-fA-F-]{36})\.xml$', 'index.php?' . self::QUERY_VAR . '=$matches[1]', 'top' );
	}

	public static function query_vars( $vars ) {
		$vars[] = self::QUERY_VAR;
		return $vars;
	}

	/** Prefix the editor appends `<guid>.xml` to. Matches wordPressFeedUrl(). */
	public static function base_url() {
		if ( get_option( 'permalink_structure' ) ) {
			return home_url( '/msp-feeds/' );
		}
		return add_query_arg( self::QUERY_VAR, '', home_url( '/' ) );
	}

	public static function url_for( $guid ) {
		return self::base_url() . rawurlencode( strtolower( $guid ) ) . '.xml';
	}

	public static function maybe_serve() {
		$requested = get_query_var( self::QUERY_VAR );
		if ( '' === $requested || null === $requested ) {
			return;
		}
		$guid = preg_replace( '/\.xml$/i', '', (string) $requested );
		$post = MSP_Studio_Feed_Store::find( $guid );
		if ( ! $post ) {
			status_header( 404 );
			nocache_headers();
			header( 'Content-Type: text/plain; charset=utf-8' );
			echo 'Feed not found';
			exit;
		}

		$xml      = MSP_Studio_Feed_Store::get_xml( $post );
		$etag     = '"' . md5( $xml ) . '"';
		$modified = strtotime( $post->post_modified_gmt . ' UTC' );

		status_header( 200 );
		header( 'Content-Type: application/xml; charset=utf-8' );
		// The feed holds bytes from imported third-party feeds and is served from
		// the same origin as wp-admin. Same invariant as MSP's own hosted feeds:
		// never sniffed as HTML, and an xml-stylesheet instruction can't run script.
		header( 'X-Content-Type-Options: nosniff' );
		header( "Content-Security-Policy: default-src 'none'; sandbox" );
		header( 'Access-Control-Allow-Origin: *' );
		header( 'Cache-Control: public, max-age=300' );
		header( 'ETag: ' . $etag );
		if ( $modified ) {
			header( 'Last-Modified: ' . gmdate( 'D, d M Y H:i:s', $modified ) . ' GMT' );
		}

		$if_none_match = isset( $_SERVER['HTTP_IF_NONE_MATCH'] ) ? trim( wp_unslash( $_SERVER['HTTP_IF_NONE_MATCH'] ) ) : '';
		if ( $if_none_match === $etag ) {
			status_header( 304 );
			exit;
		}

		if ( 'HEAD' !== ( isset( $_SERVER['REQUEST_METHOD'] ) ? $_SERVER['REQUEST_METHOD'] : 'GET' ) ) {
			echo $xml; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- an RSS document, served as XML.
		}
		exit;
	}
}

<?php
/**
 * Feed storage: one private `msp_feed` post per feed, keyed by podcastGuid.
 *
 * The XML lives in post meta, NOT post_content: WordPress runs post_content
 * through kses for users without `unfiltered_html`, which would strip the
 * feed's tags. Meta is stored as given.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class MSP_Studio_Feed_Store {

	const POST_TYPE = 'msp_feed';

	const META_XML    = '_msp_feed_xml';
	const META_GUID   = '_msp_guid';
	const META_MEDIUM = '_msp_medium';

	/** Same cap the MSP hosted endpoint uses for a feed body. */
	const MAX_XML_BYTES = 5242880;

	/** Same rule as isValidFeedId() in api/_utils/feedUtils.ts. */
	const GUID_PATTERN = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i';

	public static function init() {
		add_action( 'init', array( __CLASS__, 'register_post_type' ) );
	}

	public static function register_post_type() {
		register_post_type(
			self::POST_TYPE,
			array(
				'label'               => __( 'MSP Feeds', 'msp-studio' ),
				'public'              => false,
				'show_ui'             => false,
				'show_in_rest'        => false,
				'exclude_from_search' => true,
				'publicly_queryable'  => false,
				'rewrite'             => false,
				'query_var'           => false,
				'supports'            => array( 'title' ),
			)
		);
	}

	public static function is_valid_guid( $guid ) {
		return is_string( $guid ) && 1 === preg_match( self::GUID_PATTERN, $guid );
	}

	/** @return WP_Post|null */
	public static function find( $guid ) {
		if ( ! self::is_valid_guid( $guid ) ) {
			return null;
		}
		$posts = get_posts(
			array(
				'post_type'      => self::POST_TYPE,
				'post_status'    => 'any',
				'posts_per_page' => 1,
				'no_found_rows'  => true,
				'meta_key'       => self::META_GUID,
				'meta_value'     => strtolower( $guid ),
			)
		);
		return $posts ? $posts[0] : null;
	}

	public static function get_xml( WP_Post $post ) {
		return (string) get_post_meta( $post->ID, self::META_XML, true );
	}

	/**
	 * Create or replace a feed.
	 *
	 * @return array{post: WP_Post, created: bool}|WP_Error
	 */
	public static function save( $guid, $xml, $title ) {
		if ( ! self::is_valid_guid( $guid ) ) {
			return new WP_Error( 'msp_bad_guid', __( 'The feed GUID must be a UUID. Use "New" beside the Podcast GUID field to generate one.', 'msp-studio' ), array( 'status' => 400 ) );
		}
		if ( ! is_string( $xml ) || '' === trim( $xml ) ) {
			return new WP_Error( 'msp_empty', __( 'The feed is empty.', 'msp-studio' ), array( 'status' => 400 ) );
		}
		if ( strlen( $xml ) > self::MAX_XML_BYTES ) {
			return new WP_Error( 'msp_too_large', __( 'The feed is larger than 5 MB.', 'msp-studio' ), array( 'status' => 413 ) );
		}
		if ( ! preg_match( '/<rss[\s>]/i', substr( $xml, 0, 4096 ) ) ) {
			return new WP_Error( 'msp_not_rss', __( 'That is not an RSS feed.', 'msp-studio' ), array( 'status' => 400 ) );
		}

		$guid  = strtolower( $guid );
		$title = sanitize_text_field( (string) $title );
		$post  = self::find( $guid );

		$postarr = array(
			'post_type'   => self::POST_TYPE,
			'post_status' => 'publish',
			'post_title'  => '' !== $title ? $title : $guid,
		);
		if ( $post ) {
			$postarr['ID'] = $post->ID;
			$id            = wp_update_post( wp_slash( $postarr ), true );
		} else {
			$id = wp_insert_post( wp_slash( $postarr ), true );
		}
		if ( is_wp_error( $id ) ) {
			return $id;
		}

		// update_post_meta unslashes its value, so slash it first or every
		// backslash in the feed is lost.
		update_post_meta( $id, self::META_XML, wp_slash( $xml ) );
		update_post_meta( $id, self::META_GUID, $guid );
		update_post_meta( $id, self::META_MEDIUM, self::extract_medium( $xml ) );

		return array(
			'post'    => get_post( $id ),
			'created' => ! $post,
		);
	}

	public static function delete( $guid ) {
		$post = self::find( $guid );
		if ( ! $post ) {
			return false;
		}
		return (bool) wp_delete_post( $post->ID, true );
	}

	/** @return WP_Post[] */
	public static function all() {
		return get_posts(
			array(
				'post_type'      => self::POST_TYPE,
				'post_status'    => 'any',
				'posts_per_page' => 500,
				'orderby'        => 'modified',
				'order'          => 'DESC',
			)
		);
	}

	public static function extract_medium( $xml ) {
		if ( preg_match( '#<podcast:medium>\s*([a-zA-Z]+)\s*</podcast:medium>#', $xml, $m ) ) {
			return strtolower( $m[1] );
		}
		return '';
	}
}

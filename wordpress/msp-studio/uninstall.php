<?php
/**
 * Runs when the plugin is deleted from the Plugins screen.
 *
 * Feeds are NOT deleted: their URLs are registered in Podcast Index and
 * subscribed to in podcast apps, and deleting a plugin is too easy a click to
 * take every one of them offline. A site that really wants them gone can set
 * the option below first (wp option update msp_studio_delete_data_on_uninstall 1).
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

if ( ! get_option( 'msp_studio_delete_data_on_uninstall' ) ) {
	return;
}

$msp_studio_posts = get_posts(
	array(
		'post_type'      => 'msp_feed',
		'post_status'    => 'any',
		'posts_per_page' => -1,
		'fields'         => 'ids',
	)
);
foreach ( $msp_studio_posts as $msp_studio_id ) {
	wp_delete_post( $msp_studio_id, true );
}
delete_option( 'msp_studio_delete_data_on_uninstall' );

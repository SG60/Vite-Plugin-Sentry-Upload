import type { ResolvedConfig, Plugin } from 'vite';

import type {
	SentryCliCommitsOptions,
	SentryCliNewDeployOptions,
	SentryCliOptions,
	SentryCliUploadSourceMapsOptions
} from '@sentry/cli';
import SentryCli from '@sentry/cli';

interface ViteSentryPluginOptions extends SentryCliOptions /*, SentryCliReleases*/ {
	/**
	Unique name for the release
	Defaults to sentry-cli releases propose-version (requires access to GIT and root directory to be repo)
	**/
	release?: string;
	sourceMaps: SentryCliUploadSourceMapsOptions;
	setCommits?: SentryCliCommitsOptions;
	deploy?: SentryCliNewDeployOptions;
	finalise?: boolean;
}

export default async function sentryUploadPlugin(
	options: ViteSentryPluginOptions
): Promise<Plugin> {
	/** Vite virtual module prefix */
	const virtualModuleId = 'virtual:sentry-upload';
	const resolvedVirtualModuleId = '\0' + virtualModuleId;

	let config: ResolvedConfig;

	/* Initialise new SentryCli instance */
	const cli = new SentryCli(undefined, {
		authToken: options.authToken,
		org: options.org,
		project: options.project,
		url: options.url,
		vcsRemote: options.vcsRemote,
		silent: options.silent
	});

	/** Prepare sentry release and returns promise.
	 * Defaults to proposed version if options.release is not set. */
	const getReleasePromise = async (
		cli: SentryCli,
		options: {
			release?: string;
		} = {}
	) => {
		return (options.release ? Promise.resolve(options.release) : cli.releases.proposeVersion())
			.then((version: string) => `${version}`.trim())
			.catch(() => undefined);
	};

	const currentRelease = await getReleasePromise(cli, options);

	return {
		name: 'sentry-upload',
		enforce: 'post',

		/* Virtual module stuff
		 * Types for the virtual module are in vite-plugin-sentry-upload.d.ts
		 */
		resolveId(id) {
			if (id === virtualModuleId) {
				return resolvedVirtualModuleId;
			} else return;
		},
		load(id) {
			if (id === resolvedVirtualModuleId) {
				return `export const release = "${currentRelease}";`;
			} else return;
		},
		configResolved(resolvedConfig) {
			config = resolvedConfig;
		},

		/* Sentry stuff */
		async closeBundle() {
			if (config.isProduction && config.build.ssr) {
				if (!currentRelease) {
					this.warn('No release found, skipping Sentry upload.');
				} else {
					try {
						console.log(`Creating release: ${currentRelease} (for ${options.project})`);
						console.log(`Environment: ${options.deploy?.env}`);
						// Create new Sentry release
						await cli.releases.new(currentRelease);

						// Upload sourcemaps to Sentry
						console.log('Uploading sourcemaps to Sentry...');
						await cli.releases.uploadSourceMaps(currentRelease, options.sourceMaps);

						if (options.setCommits) {
							console.log('Setting commits...');
							if (
								options.setCommits.auto ||
								(options.setCommits.repo && options.setCommits.commit)
							) {
								await cli.releases.setCommits(currentRelease, options.setCommits);
							}
						}

						// Finalise the release
						if (options.finalise) {
							console.log('Finalising release...');
							await cli.releases.finalize(currentRelease);
						}

						// Set deploy options
						if (options.deploy && options.deploy.env) {
							console.log('Setting deploy options...');
							await cli.releases.newDeploy(currentRelease, options.deploy);
						}

						console.log('Sentry upload complete!');
					} catch (error) {
						const errorMessage = error instanceof Error ? error.message : 'Unknown error';
						this.warn(`Sentry upload failed: ${errorMessage}`);
					}
				}
			}
		}
	};
}

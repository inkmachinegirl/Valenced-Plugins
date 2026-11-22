import { Design } from '@valenced/discord/design'
import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { instead } from '@valenced/patcher'
import { Fragment, useState } from 'react'
import { Modal, View } from 'react-native'
import { myId } from './api'

/**
 * An "Edit widgets" button above the Board tab on your own profile, opening the plugin's editor
 * full screen. Discord only draws its own editing controls on the board from 354.1 (and when the
 * board is drawn with `isEditing`), so the button is left out there.
 *
 * The board's render is wrapped without adding hooks to it (the button is its own component):
 * adding hooks to a component already on screen crashes React.
 */
const BOARD = 'modules/user_profile/native/UserProfileWidgetsBoard.tsx'

function EditWidgetsButton({ Editor }: { Editor: () => any }) {
	const { Button, Text } = Design as any
	const [open, setOpen] = useState(false)
	return (
		<View style={{ marginBottom: 12 }}>
			<Button
				text="Edit widgets"
				variant="secondary"
				size="md"
				onPress={() => setOpen(true)}
			/>
			<Modal
				visible={open}
				animationType="slide"
				onRequestClose={() => setOpen(false)}
				statusBarTranslucent
			>
				<View style={{ flex: 1, backgroundColor: '#000', paddingTop: 36 }}>
					<View
						style={{
							flexDirection: 'row',
							alignItems: 'center',
							paddingHorizontal: 16,
							paddingBottom: 8,
							gap: 12,
						}}
					>
						<Text
							variant="heading-lg/bold"
							color="text-default"
							style={{ flex: 1 }}
						>
							Profile widgets
						</Text>
						<Button
							text="Done"
							size="sm"
							variant="primary"
							onPress={() => setOpen(false)}
						/>
					</View>
					<View style={{ flex: 1 }}>{open ? <Editor /> : null}</View>
				</View>
			</Modal>
		</View>
	)
}

export function patchBoard(
	cleanup: (fn: () => void) => void,
	Editor: () => any,
) {
	cleanup(
		getModuleWithImportedPath<any>(BOARD, mod => {
			if (typeof mod?.default !== 'function') return
			cleanup(
				instead(
					mod,
					'default',
					function (this: unknown, args: any[], orig: (...a: any[]) => any) {
						const tree = Reflect.apply(orig, this, args)
						const props = args[0]
						if (props?.isEditing || !props?.userId || props.userId !== myId())
							return tree
						return (
							<Fragment>
								<EditWidgetsButton Editor={Editor} />
								{tree}
							</Fragment>
						)
					},
				),
			)
		}),
	)
}

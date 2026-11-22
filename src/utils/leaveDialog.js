const handleBeforeUnload = (event) => {
    event.preventDefault();
    event.returnValue = '';
};

const addLeaveDialog = () => window.addEventListener('beforeunload', handleBeforeUnload);
const removeLeaveDialog = () => window.removeEventListener('beforeunload', handleBeforeUnload);

export function leaveDialog(enable) {
    if (enable)
        addLeaveDialog();
    else
        removeLeaveDialog();
}
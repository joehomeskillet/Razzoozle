import { ToastBar, Toaster as ToasterRaw } from "react-hot-toast"

const Toaster = () => (
  <ToasterRaw
    position="top-center"
    containerStyle={{
      top: "calc(env(safe-area-inset-top, 0px) + 16px)",
    }}
    toastOptions={{
      error: { duration: 6000 },
    }}
  >
    {(t) => (
      <ToastBar
        toast={t}
        style={{
          ...t.style,
          fontWeight: 700,
        }}
      >
        {({ icon, message }) => (
          <>
            {icon}
            {message}
          </>
        )}
      </ToastBar>
    )}
  </ToasterRaw>
)

export default Toaster
